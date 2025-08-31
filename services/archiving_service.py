# In services/archiving_service.py

import uuid
from datetime import datetime, timezone
from .s3_service import upload_to_s3, create_presigned_url
from .mongo_service import save_metadata, find_metadata_by_id, db
from . import elasticsearch_service
from . import redis_service

failed_index_collection = db["failed_indexes"]

def archive_file(file):
    filename = file.filename
    content_type = file.mimetype
    
    s3_url = upload_to_s3(file, filename)

    file_id = str(uuid.uuid4())
    metadata = {
        "file_id": file_id,
        "filename": filename,
        "s3_url": s3_url,
        "content_type": content_type,
        "archived_at": datetime.now(timezone.utc).isoformat(),
        "status": "archived"
    }
    
    # This function call is working correctly.
    save_metadata(metadata)

    try:
        metadata_for_es = metadata.copy()
        elasticsearch_service.index_document(document=metadata_for_es)
    except Exception as e:
        print(f"Warning: Failed to index metadata for file_id {file_id}. Adding to retry queue. Error: {e}")
        failed_index_collection.insert_one({
            "file_id": file_id,
            "reason": str(e),
            "timestamp": datetime.now(timezone.utc)
        })

    if "_id" in metadata:
        metadata["_id"] = str(metadata["_id"])
    
    return metadata

def get_archived_file(file_id):
    cached_metadata = redis_service.get_from_cache(key=file_id)
    if cached_metadata:
        object_name = cached_metadata.get("filename")
        download_url = create_presigned_url(object_name)
        cached_metadata["download_url"] = download_url
        return cached_metadata

    metadata = find_metadata_by_id(file_id)

    if not metadata:
        return None

    # --- THIS IS THE FIX ---
    # Create a clean, serializable copy of the metadata for caching.
    metadata_for_cache = metadata.copy()
    if "_id" in metadata_for_cache:
        metadata_for_cache["_id"] = str(metadata_for_cache["_id"])
    if "archived_at" in metadata_for_cache and isinstance(metadata_for_cache["archived_at"], datetime):
         metadata_for_cache["archived_at"] = metadata_for_cache["archived_at"].isoformat()

    # Now, cache the cleaned-up version.
    redis_service.set_to_cache(key=file_id, value=metadata_for_cache)
    
    # Continue with the original metadata for the response
    object_name = metadata.get("filename")
    download_url = create_presigned_url(object_name)
    metadata["download_url"] = download_url
    
    # And ensure the final response is also serializable
    if "_id" in metadata:
        metadata["_id"] = str(metadata["_id"])
        
    return metadata