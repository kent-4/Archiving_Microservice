# In services/archiving_service.py

import uuid
import os
from datetime import datetime, timezone
import zipfile
import io
from .s3_service import (
    upload_to_s3, 
    create_presigned_url, 
    complete_multipart_upload
)
from .mongo_service import save_metadata, find_metadata_by_id, get_db
from . import elasticsearch_service
from . import redis_service

# MIME types that we should NOT compress
DONT_COMPRESS_MIMETYPES = {
    'application/zip', 'application/x-zip-compressed', 'application/gzip', 'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'audio/mpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', # .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', # .xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', # .pptx
}

def get_failed_index_collection():
    db = get_db()
    return db["failed_indexes"]

# --- FLOW 1: FOR SMALL FILES (via /archive) ---
def archive_file_in_memory(file, user_id, tags=None, archive_policy=None):
    """
    Handles small file uploads. Reads into memory, zips if compressible,
    and uploads to S3 in a single request.
    """
    original_filename = file.filename
    original_content_type = file.mimetype
    
    file_to_upload = None
    final_filename = original_filename
    final_content_type = original_content_type
    file_size = 0
    was_compressed = False

    file_bytes = file.read() # Read file into memory

    if original_content_type in DONT_COMPRESS_MIMETYPES:
        # 1A: File is already compressed, upload as-is
        print(f"Skipping compression for {original_filename} (type: {original_content_type})")
        was_compressed = False
        file_size = len(file_bytes)
        final_filename = original_filename
        final_content_type = original_content_type
        file_to_upload = io.BytesIO(file_bytes) # Create a buffer from the bytes
        
    else:
        # 1B: File is compressible, zip it
        print(f"Compressing {original_filename} (type: {original_content_type})")
        was_compressed = True
        
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_f:
            zip_f.writestr(original_filename, file_bytes)
        
        zip_buffer.seek(0, os.SEEK_END)
        file_size = zip_buffer.tell()
        zip_buffer.seek(0, os.SEEK_SET) # Reset stream for upload
        
        final_filename = f"{original_filename}.zip"
        final_content_type = "application/zip"
        file_to_upload = zip_buffer # Upload the in-memory zip buffer
    
    # 2. Upload the resulting buffer to S3
    s3_url = upload_to_s3(file_to_upload, final_filename)
    
    # 3. Create and save metadata
    metadata = _create_metadata(
        user_id=user_id,
        file_id_str=str(uuid.uuid4()),
        s3_url=s3_url,
        final_filename=final_filename,
        original_filename=original_filename,
        final_content_type=final_content_type,
        original_content_type=original_content_type,
        was_compressed=was_compressed,
        file_size=file_size,
        tags=tags,
        archive_policy=archive_policy
    )
    
    return metadata

# --- FLOW 2: FOR LARGE FILES (via /complete-upload) ---
def finalize_multipart_archive(user_id, upload_id, filename, parts, tags, archive_policy, file_size, content_type):
    """
    Finalizes a large, direct-to-S3 multipart upload.
    This flow does NOT zip the file.
    """
    
    # 1. Complete the S3 upload
    s3_url = complete_multipart_upload(upload_id, filename, parts)
    
    # 2. Create and save metadata
    metadata = _create_metadata(
        user_id=user_id,
        file_id_str=str(uuid.uuid4()),
        s3_url=s3_url,
        final_filename=filename,
        original_filename=filename,
        final_content_type=content_type,
        original_content_type=content_type,
        was_compressed=False, # We do not compress large files in this flow
        file_size=file_size,
        tags=tags,
        archive_policy=archive_policy
    )
    
    return metadata

# --- COMMON HELPER FUNCTIONS ---

def _create_metadata(user_id, file_id_str, s3_url, final_filename, original_filename, 
                     final_content_type, original_content_type, was_compressed, 
                     file_size, tags, archive_policy):
    """Internal helper to create, save, and index metadata."""
    
    metadata = {
        "file_id": file_id_str,
        "filename": final_filename,
        "original_filename": original_filename,
        "s3_url": s3_url,
        "content_type": final_content_type,
        "original_content_type": original_content_type,
        "was_compressed": was_compressed,
        "archived_at": datetime.now(timezone.utc).isoformat(),
        "status": "archived",
        "owner_id": user_id,
        "tags": [tag.lower() for tag in tags] if tags else [],
        "archive_policy": archive_policy or "standard",
        "size": file_size
    }
    
    # Index in Elasticsearch
    _index_to_elasticsearch(file_id_str, metadata)

    if "_id" in metadata:
        metadata["_id"] = str(metadata["_id"])
    
    return metadata

def _index_to_elasticsearch(file_id, metadata):
    """Internal function to index a document and handle errors."""
    try:
        metadata_for_es = metadata.copy()
        # Remove MongoDB's _id before sending to Elasticsearch
        if "_id" in metadata_for_es:
            del metadata_for_es["_id"]
            
        elasticsearch_service.index_document(document=metadata_for_es)
    except Exception as e:
        print(f"Warning: Failed to index metadata for file_id {file_id}. Adding to retry queue. Error: {e}", flush=True)
        try:
            failed_index_collection = get_failed_index_collection()
            failed_index_collection.insert_one({
                "file_id": file_id,
                "reason": str(e),
                "timestamp": datetime.now(timezone.utc)
            })
        except Exception as db_error:
            print(f"Error: Could not save failed index to MongoDB: {db_error}", flush=True)

def get_archived_file(file_id, user_id):
    """
    Retrieve file metadata and a download URL. (Unchanged)
    """
    cache_key = f"file:{file_id}"
    cached_metadata = redis_service.get_from_cache(key=cache_key)
    if cached_metadata is not None:
        if cached_metadata.get("owner_id") != user_id:
            return None 
            
        object_name = cached_metadata.get("filename")
        download_url = create_presigned_url(object_name)
        cached_metadata["download_url"] = download_url
        return cached_metadata

    metadata = find_metadata_by_id(file_id, user_id) 

    if metadata is None:
        return None

    # ... (rest of caching logic is unchanged) ...
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