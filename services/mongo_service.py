# In services/mongo_service.py

from pymongo import MongoClient, ASCENDING
from pymongo.errors import PyMongoError
from config import MONGO_URI, MONGO_DB_NAME
import certifi

# Initialize client and database
client = None
db = None
metadata_collection = None

def get_db():
    """Get the database instance"""
    if db is None:
        raise Exception("MongoDB not initialized. Call initialize_mongodb() first.")
    return db

def initialize_mongodb():
    """Initialize MongoDB connection and collections"""
    global client, db, metadata_collection
    
    try:
        client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
        db = client[MONGO_DB_NAME]
        
        # Use consistent collection name - matching your playground script
        metadata_collection = db["files_metadata"]
        
        # Test the connection
        client.admin.command('ping')
        print("✅ Successfully connected to MongoDB Atlas")
        print("Databases:", client.list_database_names())
        
        # Create index for performance
        create_indexes()
        return True
        
    except PyMongoError as e:
        print(f"❌ MongoDB connection failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error connecting to MongoDB: {e}")
        return False

def create_indexes():
    """Create necessary indexes for optimal performance"""
    try:
        # FIXED: Check if metadata_collection is not None instead of truthy
        if metadata_collection is not None:
            # Create a unique index on 'file_id' to ensure fast lookups and data integrity
            metadata_collection.create_index([("file_id", ASCENDING)], unique=True)
            print("✅ MongoDB index on 'file_id' ensured.")
        else:
            print("⚠️  Warning: metadata_collection is None, cannot create index")
    except PyMongoError as e:
        print(f"⚠️  Warning: Could not create MongoDB index. Error: {e}")
        # Don't raise here - the app can still function without the index
        
def save_metadata(metadata):
    """
    Saves a metadata document to the 'files_metadata' collection in MongoDB.
    """
    # FIXED: Check if metadata_collection is not None instead of truthy
    if metadata_collection is None:
        raise Exception("MongoDB not initialized. Call initialize_mongodb() first.")
        
    try:
        result = metadata_collection.insert_one(metadata)
        print(f"✅ Metadata saved successfully to MongoDB with ID: {result.inserted_id}")
        return result.inserted_id
    except PyMongoError as e:
        print(f"❌ Critical Error saving metadata to MongoDB: {e}")
        raise

def find_metadata_by_id(file_id):
    """
    Finds a single metadata document by its file_id.
    """
    # FIXED: Check if metadata_collection is not None instead of truthy
    if metadata_collection is None:
        raise Exception("MongoDB not initialized. Call initialize_mongodb() first.")
        
    try:
        metadata = metadata_collection.find_one({"file_id": file_id})
        if metadata is not None:  # FIXED: Compare with None instead of truthy check
            print(f"✅ Found metadata for file_id: {file_id}")
        else:
            print(f"⚠️  No metadata found for file_id: {file_id}")
        return metadata
    except PyMongoError as e:
        print(f"❌ Critical Error finding metadata in MongoDB: {e}")
        raise