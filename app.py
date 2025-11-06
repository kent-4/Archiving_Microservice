from flask import Flask, request, jsonify
from functools import wraps
from config import SECRET_API_KEY 
import time
import datetime
import os # <-- Make sure os is imported
import uuid # <-- Make sure uuid is imported

# --- NEW IMPORTS FOR AUTH ---
from flask_bcrypt import Bcrypt
from flask_jwt_extended import (
    create_access_token, get_jwt_identity, jwt_required, JWTManager,
    set_access_cookies, unset_jwt_cookies 
)
from pymongo.errors import DuplicateKeyError
from flask_cors import CORS

# --- SERVICE IMPORTS ---
from services.archiving_service import (
    archive_file_in_memory, # <-- RENAMED
    get_archived_file,
    finalize_multipart_archive
)
from services import (
    elasticsearch_service, 
    mongo_service,
    s3_service # <-- IMPORTED
)
from prometheus_flask_exporter import PrometheusMetrics
from prometheus_client import Counter
from elasticsearch import Elasticsearch, ConnectionError as ESConnectionError

app = Flask(__name__)

origins = [
    "http://localhost:3000", # For dev
    "http://localhost:3001", # For your dev
    "http://127.0.0.1:3000",
    # "https://your-production-domain.com" # For production
]
CORS(app, supports_credentials=True, origins=origins)

app.config["JWT_SECRET_KEY"] = SECRET_API_KEY 
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(days=1)
app.config["JWT_TOKEN_LOCATION"] = ["cookies"]
app.config["JWT_COOKIE_CSRF_PROTECT"] = True 
app.config["JWT_COOKIE_SAMESITE"] = "Lax"

bcrypt = Bcrypt(app)
jwt = JWTManager(app)

metrics = PrometheusMetrics(app)
FILES_ARCHIVED_COUNTER = Counter('files_archived_total', 'Total number of files archived')


# --- NEW: Auth Endpoints ---
@app.route('/auth/register', methods=['POST'])
def register_user():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({"error": "Email and password are required."}), 400

        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        
        user_collection = mongo_service.get_user_collection()
        user_collection.insert_one({
            "email": email,
            "password": hashed_password,
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        })
        
        return jsonify({"message": "User registered successfully."}), 201
        
    except DuplicateKeyError:
        return jsonify({"error": "Email already exists."}), 400
    except Exception as e:
        app.logger.error(f"Error during registration: {e}")
        return jsonify({"error": "An internal server error occurred."}), 500

@app.route('/auth/login', methods=['POST'])
def login_user():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({"error": "Email and password are required."}), 400

        user_collection = mongo_service.get_user_collection()
        user = user_collection.find_one({"email": email})

        if user and bcrypt.check_password_hash(user['password'], password):
            # Create access token
            access_token = create_access_token(identity=str(user['_id']))
            
            # --- THIS IS THE FIX ---
            # 1. Create the JSON response body
            response_body = {
                "message": "Login successful.",
                "user": {
                    "email": user['email']
                }
            }
            # 2. Create the response object
            response = jsonify(response_body)
            
            # 3. Set the HttpOnly cookie on the response
            set_access_cookies(response, access_token)
            
            return response, 200
            # --- END FIX ---
        else:
            return jsonify({"error": "Invalid email or password."}), 401
            
    except Exception as e:
        app.logger.error(f"Error during login: {e}")
        return jsonify({"error": "An internal server error occurred."}), 500

@app.route("/auth/logout", methods=["POST"])
def logout_user():
    response = jsonify({"message": "Logout successful."})
    unset_jwt_cookies(response) # Clear the HttpOnly cookie
    return response, 200

# --- THIS IS THE "SMALL FILE" ENDPOINT ---
@app.route('/archive', methods=['POST'])
@jwt_required()
def handle_archive():
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected for uploading"}), 400

    # --- SERVER-SIDE SIZE CHECK (Optional but recommended) ---
    MAX_SMALL_FILE_SIZE = 25 * 1024 * 1024 # 25MB
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0, os.SEEK_SET)
    
    if file_size > MAX_SMALL_FILE_SIZE:
        return jsonify({"error": "File is too large for this endpoint. Use multipart upload."}), 413
    # --- END SIZE CHECK ---

    try:
        current_user_id = get_jwt_identity()
        tags_str = request.form.get('tags', '')
        tags = [tag.strip() for tag in tags_str.split(',') if tag.strip()]
        policy = request.form.get('policy', 'standard')
        
        # --- USE THE IN-MEMORY FUNCTION ---
        metadata = archive_file_in_memory(
            file, 
            user_id=current_user_id, 
            tags=tags, 
            archive_policy=policy
        )
        
        FILES_ARCHIVED_COUNTER.inc()
        return jsonify(metadata), 201
    except ValueError as ve:
        app.logger.error(f"Configuration error during archiving: {ve}")
        return jsonify({"error": str(ve)}), 500
    except Exception as e:
        app.logger.error(f"An error occurred during archiving: {e}")
        return jsonify({"error": "An internal error occurred. Check the server logs."}), 500

# --- THESE ARE THE "LARGE FILE" ENDPOINTS ---

@app.route('/archive/start-upload', methods=['POST'])
@jwt_required()
def start_upload():
    try:
        data = request.get_json()
        filename = data.get('filename')
        if not filename:
            return jsonify({"error": "Filename is required."}), 400
            
        upload_id = s3_service.create_multipart_upload(filename)
        return jsonify({"uploadId": upload_id}), 200
        
    except Exception as e:
        app.logger.error(f"Error starting multipart upload: {e}")
        return jsonify({"error": "Could not start upload."}), 500

@app.route('/archive/get-upload-part-url', methods=['POST'])
@jwt_required()
def get_upload_part_url():
    try:
        data = request.get_json()
        filename = data.get('filename')
        upload_id = data.get('uploadId')
        part_number = data.get('partNumber')
        
        if not all([filename, upload_id, part_number]):
            return jsonify({"error": "filename, uploadId, and partNumber are required."}), 400
            
        presigned_url = s3_service.generate_presigned_part_url(upload_id, filename, part_number)
        
        if presigned_url:
            return jsonify({"url": presigned_url}), 200
        else:
            return jsonify({"error": "Could not generate presigned URL."}), 500
            
    except Exception as e:
        app.logger.error(f"Error getting part URL: {e}")
        return jsonify({"error": "Could not get part URL."}), 500

@app.route('/archive/complete-upload', methods=['POST'])
@jwt_required()
def complete_upload():
    try:
        data = request.get_json()
        filename = data.get('filename')
        upload_id = data.get('uploadId')
        parts = data.get('parts')
        tags_str = data.get('tags', '')
        tags = [tag.strip() for tag in tags_str.split(',') if tag.strip()]
        policy = data.get('policy', 'standard')
        file_size = data.get('fileSize')
        content_type = data.get('contentType', 'application/octet-stream')
        
        if not all([filename, upload_id, parts, file_size is not None]):
            return jsonify({"error": "filename, uploadId, parts, and fileSize are required."}), 400

        current_user_id = get_jwt_identity()
        
        metadata = finalize_multipart_archive(
            user_id=current_user_id,
            upload_id=upload_id,
            filename=filename,
            parts=parts,
            tags=tags,
            archive_policy=policy,
            file_size=file_size,
            content_type=content_type
        )
        
        FILES_ARCHIVED_COUNTER.inc()
        return jsonify(metadata), 201
        
    except Exception as e:
        app.logger.error(f"Error completing multipart upload: {e}")
        try:
            upload_id = request.get_json().get('uploadId')
            filename = request.get_json().get('filename')
            if upload_id and filename:
                s3_service.abort_multipart_upload(upload_id, filename)
        except Exception as abort_e:
            app.logger.error(f"Failed to abort upload {upload_id}: {abort_e}")
            
        return jsonify({"error": "Could not complete upload."}), 500

# --- UPDATED: Use @jwt_required ---
@app.route('/archive/<file_id>', methods=['GET'])
@jwt_required()
def handle_get_archive(file_id):
    try:
        current_user_id = get_jwt_identity()
        
        # --- UPDATED: Pass user_id for security ---
        file_data = get_archived_file(file_id, user_id=current_user_id)
        
        if file_data:
            return jsonify(file_data), 200
        else:
            return jsonify({"error": "File not found or you do not have permission"}), 404
    except Exception as e:
        app.logger.error(f"An error occurred retrieving file {file_id}: {e}")
        return jsonify({"error": "An internal error occurred. Check the server logs."}), 500

# --- UPDATED: Use @jwt_required ---
@app.route('/search', methods=['GET'])
@jwt_required()
def handle_search():
    current_user_id = get_jwt_identity()
    query_string = request.args.get('q', '') # Now optional
    
    # --- NEW: Get advanced filter params ---
    tags_str = request.args.get('tags', '')
    tags = [tag.strip() for tag in tags_str.split(',') if tag.strip()] or None
    start_date = request.args.get('start_date') # Expects ISO format (YYYY-MM-DD)
    end_date = request.args.get('end_date')
    # --- END NEW ---

    try:
        # --- UPDATED: Pass all params to service ---
        results = elasticsearch_service.search_documents(
            user_id=current_user_id,
            query_string=query_string,
            tags=tags,
            start_date=start_date,
            end_date=end_date
        )
        return jsonify(results), 200
    except Exception as e:
        app.logger.error(f"An error occurred during search: {e}")
        return jsonify({"error": "An internal error occurred. Check the server logs."}), 500

# --- NEW: Dashboard Endpoints ---
@app.route('/dashboard/stats', methods=['GET'])
@jwt_required()
def handle_get_stats():
    current_user_id = get_jwt_identity()
    try:
        stats = elasticsearch_service.get_dashboard_stats(current_user_id)
        return jsonify(stats), 200
    except Exception as e:
        app.logger.error(f"An error occurred getting stats: {e}")
        return jsonify({"error": "An internal error occurred."}), 500

@app.route('/dashboard/recent', methods=['GET'])
@jwt_required()
def handle_get_recent():
    current_user_id = get_jwt_identity()
    try:
        # Get top 5 recent
        recent_files = elasticsearch_service.get_recent_documents(current_user_id, size=5)
        return jsonify(recent_files), 200
    except Exception as e:
        app.logger.error(f"An error occurred getting recent files: {e}")
        return jsonify({"error": "An internal error occurred."}), 500
# --- END NEW DASHBOARD ENDPOINTS ---


def connect_to_elasticsearch_with_retry():
    # ... (this function remains the same)
    retries = 5
    delay = 5  # seconds
    for i in range(retries):
        try:
            elasticsearch_service.create_index_if_not_exists()
            print("✅ Successfully connected to Elasticsearch and ensured index exists.")
            return True
        except ESConnectionError as e:
            print(f"❌ Elasticsearch connection failed (attempt {i+1}/{retries}): {e}. Retrying in {delay} seconds...")
            time.sleep(delay)
    print("❌ Critical Error: Could not connect to Elasticsearch after several retries.")
    return False

def connect_to_mongodb_with_retry():
    # ... (this function remains the same)
    retries = 3
    delay = 2  # seconds
    for i in range(retries):
        try:
            if mongo_service.initialize_mongodb():
                return True
        except Exception as e:
            print(f"❌ MongoDB connection failed (attempt {i+1}/{retries}): {e}. Retrying in {delay} seconds...")
            time.sleep(delay)
    print("❌ Critical Error: Could not connect to MongoDB after several retries.")
    return False

if __name__ == '__main__':
    print("🚀 Starting application...")
    
    mongodb_connected = connect_to_mongodb_with_retry()
    if not mongodb_connected:
        print("❌ Failed to connect to MongoDB. Exiting...")
        exit(1)
    
    elasticsearch_connected = connect_to_elasticsearch_with_retry()
    if not elasticsearch_connected:
        print("❌ Failed to connect to Elasticsearch. Exiting...")
        exit(1)
    
    print("✅ All services connected successfully!")
    app.run(host='0.0.0.0', port=5000)