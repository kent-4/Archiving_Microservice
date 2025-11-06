# In services/archiving_service.py

import uuid
import os # --- NEW ---
from datetime import datetime, timezone
from .s3_service import upload_to_s3, create_presigned_url
from .mongo_service import save_metadata, find_metadata_by_id, get_db
from . import elasticsearch_service
from . import redis_service

def get_failed_index_collection():
    """Get the failed_indexes collection from MongoDB"""
    db = get_db()
    return db["failed_indexes"]

def archive_file(file, user_id, tags=None, archive_policy=None): # --- UPDATED ---
    filename = file.filename
    content_type = file.mimetype
    
    # --- NEW: Calculate file size ---
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0, os.SEEK_SET) # Reset stream for upload
    # --- END NEW ---
    
    s3_url = upload_to_s3(file, filename)

    file_id = str(uuid.uuid4())
    
    # --- UPDATED METADATA ---
    metadata = {
        "file_id": file_id,
        "filename": filename,
        "s3_url": s3_url,
        "content_type": content_type,
        "archived_at": datetime.now(timezone.utc).isoformat(),
        "status": "archived",
        
        # --- NEW FIELDS ---
        "owner_id": user_id,
        "tags": tags or [], # Store as a list
        "archive_policy": archive_policy or "standard",
        "size": file_size # Store size in bytes
        # --- END NEW FIELDS ---
    }
    # --- END UPDATED METADATA ---
    
    save_metadata(metadata)

    try:
        metadata_for_es = metadata.copy()
        elasticsearch_service.index_document(document=metadata_for_es)
    except Exception as e:
        print(f"Warning: Failed to index metadata for file_id {file_id}. Adding to retry queue. Error: {e}")
        
        try:
            failed_index_collection = get_failed_index_collection()
            failed_index_collection.insert_one({
                "file_id": file_id,
                "reason": str(e),
                "timestamp": datetime.now(timezone.utc)
            })
        except Exception as db_error:
            print(f"Error: Could not save failed index to MongoDB: {db_error}")

    if "_id" in metadata:
        metadata["_id"] = str(metadata["_id"])
    
    return metadata

def get_archived_file(file_id, user_id): # --- UPDATED ---
    cache_key = f"file:{file_id}"
    cached_metadata = redis_service.get_from_cache(key=cache_key)
    if cached_metadata is not None:
        # --- NEW: Check if cached item belongs to user ---
        if cached_metadata.get("owner_id") != user_id:
            return None # Not their file
            
        object_name = cached_metadata.get("filename")
        download_url = create_presigned_url(object_name)
        cached_metadata["download_url"] = download_url
        return cached_metadata

    # --- UPDATED: Pass user_id for security ---
    metadata = find_metadata_by_id(file_id, user_id) 

    if metadata is None:
        return None

    metadata_for_cache = metadata.copy()
    if "_id" in metadata_for_cache:
        metadata_for_cache["_id"] = str(metadata_for_cache["_id"])
    if "archived_at" in metadata_for_cache and isinstance(metadata_for_cache["archived_at"], datetime):
         metadata_for_cache["archived_at"] = metadata_for_cache["archived_at"].isoformat()

    redis_service.set_to_cache(key=cache_key, value=metadata_for_cache)
    
    object_name = metadata.get("filename")
    download_url = create_presigned_url(object_name)
    metadata["download_url"] = download_url
    
    if "_id" in metadata:
        metadata["_id"] = str(metadata["_id"])
        
    return metadata