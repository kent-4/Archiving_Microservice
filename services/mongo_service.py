# In services/mongo_service.py

from pymongo import MongoClient, ASCENDING
from pymongo.errors import PyMongoError
from config import MONGO_URI, MONGO_DB_NAME
import certifi

# Initialize client and database
client = None
db = None
metadata_collection = None
user_collection = None # --- NEW ---

def get_db():
    """Get the database instance"""
    if db is None:
        raise Exception("MongoDB not initialized. Call initialize_mongodb() first.")
    return db

# --- NEW FUNCTION ---
def get_user_collection():
    """Get the users collection instance"""
    if user_collection is None:
        raise Exception("MongoDB not initialized. Call initialize_mongodb() first.")
    return user_collection

def initialize_mongodb():
    """Initialize MongoDB connection and collections"""
    global client, db, metadata_collection, user_collection # --- UPDATED ---
    
    try:
        client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
        db = client[MONGO_DB_NAME]
        
        # Use consistent collection name
        metadata_collection = db["files_metadata"]
        user_collection = db["users"] # --- NEW ---
        
        # Test the connection
        client.admin.command('ping')
        print("✅ Successfully connected to MongoDB Atlas")
        
        # Create indexes for performance
        create_metadata_indexes()
        create_user_index() # --- NEW ---
        return True
        
    except PyMongoError as e:
        print(f"❌ MongoDB connection failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error connecting to MongoDB: {e}")
        return False

def create_metadata_indexes():
    """Create necessary indexes for the metadata collection"""
    try:
        if metadata_collection is not None:
            metadata_collection.create_index([("file_id", ASCENDING)], unique=True)
            metadata_collection.create_index([("owner_id", ASCENDING)]) # --- NEW ---
            print("✅ MongoDB metadata indexes ensured.")
        else:
            print("⚠️  Warning: metadata_collection is None, cannot create index")
    except PyMongoError as e:
        print(f"⚠️  Warning: Could not create MongoDB metadata index. Error: {e}")

# --- NEW FUNCTION ---
def create_user_index():
    """Create necessary indexes for the user collection"""
    try:
        if user_collection is not None:
            # Create a unique index on 'email'
            user_collection.create_index([("email", ASCENDING)], unique=True)
            print("✅ MongoDB user index on 'email' ensured.")
        else:
            print("⚠️  Warning: user_collection is None, cannot create index")
    except PyMongoError as e:
        print(f"⚠️  Warning: Could not create MongoDB user index. Error: {e}")
        
def save_metadata(metadata):
    """
    Saves a metadata document to the 'files_metadata' collection in MongoDB.
    """
    if metadata_collection is None:
        raise Exception("MongoDB not initialized. Call initialize_mongodb() first.")
        
    try:
        result = metadata_collection.insert_one(metadata)
        print(f"✅ Metadata saved successfully to MongoDB with ID: {result.inserted_id}")
        return result.inserted_id
    except PyMongoError as e:
        print(f"❌ Critical Error saving metadata to MongoDB: {e}")
        raise

def find_metadata_by_id(file_id, user_id): # --- UPDATED ---
    """
    Finds a single metadata document by its file_id and user_id.
    """
    if metadata_collection is None:
        raise Exception("MongoDB not initialized. Call initialize_mongodb() first.")
        
    try:
        # --- UPDATED: Ensure user can only find their own files ---
        metadata = metadata_collection.find_one({"file_id": file_id, "owner_id": user_id})
        
        if metadata is not None:
            print(f"✅ Found metadata for file_id: {file_id}")
        else:
            print(f"⚠️  No metadata found for file_id: {file_id}")
        return metadata
    except PyMongoError as e:
        print(f"❌ Critical Error finding metadata in MongoDB: {e}")
        raise