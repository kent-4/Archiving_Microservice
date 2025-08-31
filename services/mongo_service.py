# In services/mongo_service.py

from pymongo import MongoClient, ASCENDING
from pymongo.errors import PyMongoError
from config import MONGO_URI, MONGO_DB_NAME

client = MongoClient(MONGO_URI)
db = client[MONGO_DB_NAME]
metadata_collection = db["metadata"]

# --- PERFORMANCE IMPROVEMENT ---
# Create a unique index on 'file_id' to ensure fast lookups and data integrity.
# This command is idempotent; it will only create the index if it doesn't exist.
try:
    metadata_collection.create_index([("file_id", ASCENDING)], unique=True)
    print("MongoDB index on 'file_id' ensured.")
except PyMongoError as e:
    print(f"!!! Critical Error: Could not create MongoDB index. Error: {e}")
    # Depending on your policy, you might want to exit the application
    # if the database can't be set up correctly.
    # raise

def save_metadata(metadata):
    """
    Saves a metadata document to the 'metadata' collection in MongoDB.
    """
    try:
        metadata_collection.insert_one(metadata)
        print("Metadata saved successfully to MongoDB.")
    except PyMongoError as e: # Catching a more specific exception
        print(f"!!! Critical Error saving metadata to MongoDB: {e}")
        raise

def find_metadata_by_id(file_id):
    """
    Finds a single metadata document by its file_id.
    """
    try:
        metadata = metadata_collection.find_one({"file_id": file_id})
        return metadata
    except PyMongoError as e: # Catching a more specific exception
        print(f"!!! Critical Error finding metadata in MongoDB: {e}")
        raise