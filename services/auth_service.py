from flask import jsonify
from flask_bcrypt import Bcrypt
from flask_jwt_extended import create_access_token, set_access_cookies, unset_jwt_cookies
from pymongo.errors import DuplicateKeyError
import uuid
import datetime

from services import mongo_service, redis_service, email_service

bcrypt = Bcrypt()

def register_user(data):
    try:
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
        # It's better to log the error here
        print(f"Error during registration: {e}")
        return jsonify({"error": "An internal server error occurred."}), 500

def login_user(data):
    try:
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({"error": "Email and password are required."}), 400

        user_collection = mongo_service.get_user_collection()
        user = user_collection.find_one({"email": email})

        if user and bcrypt.check_password_hash(user['password'], password):
            access_token = create_access_token(identity=str(user['_id']))
            
            response_body = {
                "message": "Login successful.",
                "user": {
                    "email": user['email']
                }
            }
            response = jsonify(response_body)
            set_access_cookies(response, access_token)
            
            return response, 200
        else:
            return jsonify({"error": "Invalid email or password."}), 401
            
    except Exception as e:
        print(f"Error during login: {e}")
        return jsonify({"error": "An internal server error occurred."}), 500

def logout_user():
    response = jsonify({"message": "Logout successful."})
    unset_jwt_cookies(response)
    return response, 200

def reset_password_request(data):
    try:
        email = data.get('email')

        if not email:
            return jsonify({"error": "Email is required."}), 400

        user_collection = mongo_service.get_user_collection()
        user = user_collection.find_one({"email": email})

        if user:
            token = uuid.uuid4().hex
            redis_service.set_to_cache(f"password_reset_{token}", {"email": email}, expiration=3600)
            reset_link = f"http://localhost:3000/reset-password?token={token}"
            email_service.send_password_reset_email(email, reset_link)

        return jsonify({"message": "If a user with that email exists, a password reset link has been sent."}), 200

    except Exception as e:
        print(f"Error during password reset request: {e}")
        return jsonify({"error": "An internal server error occurred."}), 500

def reset_password(data):
    try:
        token = data.get('token')
        new_password = data.get('password')

        if not token or not new_password:
            return jsonify({"error": "Token and new password are required."}), 400

        user_data = redis_service.get_from_cache(f"password_reset_{token}")

        if not user_data:
            return jsonify({"error": "Invalid or expired token."}), 400

        email = user_data.get('email')
        hashed_password = bcrypt.generate_password_hash(new_password).decode('utf-8')

        user_collection = mongo_service.get_user_collection()
        user_collection.update_one({"email": email}, {"$set": {"password": hashed_password}})
        
        redis_service.delete_from_cache(f"password_reset_{token}")

        return jsonify({"message": "Password has been reset successfully."}), 200

    except Exception as e:
        print(f"Error during password reset: {e}")
        return jsonify({"error": "An internal server error occurred."}), 500
