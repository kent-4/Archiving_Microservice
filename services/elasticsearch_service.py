# In services/elasticsearch_service.py

from elasticsearch import Elasticsearch, ConnectionError as ESConnectionError
from config import ELASTICSEARCH_HOST
from datetime import datetime

# Initialize Elasticsearch client
es_client = Elasticsearch([ELASTICSEARCH_HOST])

INDEX_NAME = "archived_files"

def create_index_if_not_exists():
    """Create the Elasticsearch index if it doesn't exist"""
    try:
        if not es_client.indices.exists(index=INDEX_NAME):
            # Define index mapping - UPDATED
            mapping = {
                "mappings": {
                    "properties": {
                        "file_id": {"type": "keyword"},
                        "filename": {"type": "text", "analyzer": "standard"},
                        "content_type": {"type": "keyword"},
                        "s3_url": {"type": "keyword"},
                        "archived_at": {"type": "date"},
                        "status": {"type": "keyword"},
                        "tags": {"type": "keyword"},
                        "archive_policy": {"type": "keyword"},
                        "size": {"type": "long"},
                        "owner_id": {"type": "keyword"},
                        
                        # --- FIELDS ADDED FOR ZIPPING ---
                        "original_filename": {"type": "text", "analyzer": "standard"},
                        "original_content_type": {"type": "keyword"},
                        "was_compressed": {"type": "boolean"} # <-- NEW
                        # --- END NEW FIELDS ---
                    }
                }
            }
            
            es_client.indices.create(index=INDEX_NAME, body=mapping)
            print(f"✅ Created Elasticsearch index: {INDEX_NAME}")
        else:
            print(f"✅ Elasticsearch index {INDEX_NAME} already exists")
    except Exception as e:
        print(f"❌ Error creating Elasticsearch index: {e}")
        raise

def index_document(document):
    """Index a document in Elasticsearch"""
    try:
        response = es_client.index(
            index=INDEX_NAME,
            id=document.get("file_id"),
            body=document
        )
        print(f"✅ Indexed document {document.get('file_id')} in Elasticsearch")
        return response
    except Exception as e:
        print(f"❌ Error indexing document in Elasticsearch: {e}")
        raise

def search_documents(user_id, query_string, tags=None, start_date=None, end_date=None, size=10):
    """Search documents in Elasticsearch with advanced filtering"""
    try:
        # Base query: must match user_id
        must_queries = [
            {"term": {"owner_id": user_id}}
        ]

        # Add full-text search if query_string is provided
        if query_string:
            must_queries.append(
                {"multi_match": {
                    "query": query_string,
                    "fields": ["filename", "content_type", "tags"], # Added 'tags' to search
                    "fuzziness": "AUTO"
                }}
            )
        
        # Build filter context
        filters = []
        
        # Add tags filter
        if tags:
            # Assuming 'tags' is a list of strings
            filters.append({"terms": {"tags": tags}})
            
        # Add date range filter
        date_range = {}
        if start_date:
            date_range["gte"] = start_date
        if end_date:
            date_range["lte"] = end_date
        if date_range:
            filters.append({"range": {"archived_at": date_range}})

        search_body = {
            "query": {
                "bool": {
                    "must": must_queries,
                    "filter": filters
                }
            },
            "size": size,
            "sort": [
                {"archived_at": {"order": "desc"}} # Sort by most recent
            ]
        }
        
        response = es_client.search(index=INDEX_NAME, body=search_body)
        
        hits = response.get("hits", {}).get("hits", [])
        results = [hit.get("_source", {}) for hit in hits]
        
        print(f"✅ Found {len(results)} documents matching query")
        return {
            "total": response.get("hits", {}).get("total", {}).get("value", 0),
            "results": results
        }
        
    except Exception as e:
        print(f"❌ Error searching documents in Elasticsearch: {e}")
        raise

# --- NEW FUNCTION for Dashboard Recent Archives ---
def get_recent_documents(user_id, size=5):
    """Get the most recent documents for a user"""
    try:
        search_body = {
            "query": {
                "term": {"owner_id": user_id}
            },
            "size": size,
            "sort": [
                {"archived_at": {"order": "desc"}}
            ]
        }
        response = es_client.search(index=INDEX_NAME, body=search_body)
        hits = response.get("hits", {}).get("hits", [])
        results = [hit.get("_source", {}) for hit in hits]
        return {"results": results}
        
    except Exception as e:
        print(f"❌ Error getting recent documents: {e}")
        return {"results": []}

# --- NEW FUNCTION for Dashboard Stats ---
def get_dashboard_stats(user_id):
    """Get dashboard stats (total items, total size, last upload) for a user"""
    try:
        query_body = {
            "query": {
                "term": {"owner_id": user_id}
            },
            "size": 0, # We don't need the documents, just the aggregations
            "aggs": {
                "total_storage": {
                    "sum": {"field": "size"}
                },
                "last_upload": {
                    "max": {"field": "archived_at"}
                }
            }
        }
        
        response = es_client.search(index=INDEX_NAME, body=query_body)
        
        total_items = response.get("hits", {}).get("total", {}).get("value", 0)
        aggs = response.get("aggregations", {})
        
        total_storage = aggs.get("total_storage", {}).get("value", 0)
        last_upload_raw = aggs.get("last_upload", {}).get("value_as_string")

        # Format last_upload nicely
        if last_upload_raw:
            last_upload = datetime.fromisoformat(last_upload_raw.replace("Z", "+00:00")).isoformat()
        else:
            last_upload = None

        return {
            "totalItems": total_items,
            "storageUsed": total_storage, # In bytes
            "lastUpload": last_upload
        }
        
    except Exception as e:
        print(f"❌ Error getting dashboard stats: {e}")
        raise

def delete_document(file_id):
    """Delete a document from Elasticsearch"""
    try:
        response = es_client.delete(index=INDEX_NAME, id=file_id)
        print(f"✅ Deleted document {file_id} from Elasticsearch")
        return response
    except Exception as e:
        print(f"❌ Error deleting document from Elasticsearch: {e}")
        raise

def test_elasticsearch_connection():
    """Test Elasticsearch connection"""
    try:
        info = es_client.info()
        if info is not None:
            print("✅ Successfully connected to Elasticsearch")
            return True
        else:
            print("❌ Elasticsearch connection failed: No response")
            return False
    except Exception as e:
        print(f"❌ Elasticsearch connection failed: {e}")
        return False