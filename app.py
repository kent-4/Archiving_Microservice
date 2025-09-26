from flask import Flask, request, jsonify
from functools import wraps
from config import SECRET_API_KEY
from services.archiving_service import archive_file, get_archived_file
from prometheus_flask_exporter import PrometheusMetrics
from prometheus_client import Counter
from services import elasticsearch_service
from services import mongo_service
from elasticsearch import Elasticsearch, ConnectionError as ESConnectionError
import time

app = Flask(__name__)

# This setup is correct. The previous issue was not related to this.
metrics = PrometheusMetrics(app)

# Create a custom metric to count total files archived
FILES_ARCHIVED_COUNTER = Counter('files_archived_total', 'Total number of files archived')

def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not SECRET_API_KEY:
            return jsonify({"error": "Internal server error: API key not configured."}), 500
        
        provided_key = request.headers.get('X-API-Key')
        if provided_key and provided_key == SECRET_API_KEY:
            return f(*args, **kwargs)
        else:
            return jsonify({"error": "Unauthorized: Invalid or missing API key."}), 401
    
    # --- THIS IS THE FIX ---
    # A decorator must always return the wrapped function.
    return decorated_function

@app.route('/archive', methods=['POST'])
@require_api_key
def handle_archive():
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected for uploading"}), 400

    try:
        metadata = archive_file(file)
        FILES_ARCHIVED_COUNTER.inc()
        return jsonify(metadata), 201
    except ValueError as ve:
        app.logger.error(f"Configuration error during archiving: {ve}")
        return jsonify({"error": str(ve)}), 500
    except Exception as e:
        app.logger.error(f"An error occurred during archiving: {e}")
        return jsonify({"error": "An internal error occurred. Check the server logs."}), 500

@app.route('/archive/<file_id>', methods=['GET'])
@require_api_key
def handle_get_archive(file_id):
    try:
        file_data = get_archived_file(file_id)
        if file_data:
            return jsonify(file_data), 200
        else:
            return jsonify({"error": "File not found"}), 404
    except Exception as e:
        app.logger.error(f"An error occurred retrieving file {file_id}: {e}")
        return jsonify({"error": "An internal error occurred. Check the server logs."}), 500

@app.route('/search', methods=['GET'])
@require_api_key
def handle_search():
    query_string = request.args.get('q')
    if not query_string:
        return jsonify({"error": "Query parameter 'q' is required."}), 400

    try:
        results = elasticsearch_service.search_documents(query_string)
        return jsonify(results), 200
    except Exception as e:
        app.logger.error(f"An error occurred during search: {e}")
        return jsonify({"error": "An internal error occurred. Check the server logs."}), 500

def connect_to_elasticsearch_with_retry():
    """Tries to connect to Elasticsearch, retrying a few times on failure."""
    retries = 5
    delay = 5  # seconds
    for i in range(retries):
        try:
            # Attempt to create the index, which serves as a connection check
            elasticsearch_service.create_index_if_not_exists()
            print("✅ Successfully connected to Elasticsearch and ensured index exists.")
            return True
        except ESConnectionError as e:
            print(f"❌ Elasticsearch connection failed (attempt {i+1}/{retries}): {e}. Retrying in {delay} seconds...")
            time.sleep(delay)
    print("❌ Critical Error: Could not connect to Elasticsearch after several retries.")
    return False

def connect_to_mongodb_with_retry():
    """Tries to connect to MongoDB, retrying a few times on failure."""
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
    
    # Connect to MongoDB first
    mongodb_connected = connect_to_mongodb_with_retry()
    if not mongodb_connected:
        print("❌ Failed to connect to MongoDB. Exiting...")
        exit(1)
    
    # Connect to Elasticsearch
    elasticsearch_connected = connect_to_elasticsearch_with_retry()
    if not elasticsearch_connected:
        print("❌ Failed to connect to Elasticsearch. Exiting...")
        exit(1)
    
    print("✅ All services connected successfully!")
    app.run(host='0.0.0.0', port=5000)