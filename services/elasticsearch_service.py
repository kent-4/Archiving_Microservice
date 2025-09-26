# In services/elasticsearch_service.py

from elasticsearch import Elasticsearch, ConnectionError as ESConnectionError
from config import ELASTICSEARCH_HOST

# Initialize Elasticsearch client
es_client = Elasticsearch([ELASTICSEARCH_HOST])

INDEX_NAME = "archived_files"

def create_index_if_not_exists():
    """Create the Elasticsearch index if it doesn't exist"""
    try:
        if not es_client.indices.exists(index=INDEX_NAME):
            # Define index mapping
            mapping = {
                "mappings": {
                    "properties": {
                        "file_id": {"type": "keyword"},
                        "filename": {"type": "text", "analyzer": "standard"},
                        "content_type": {"type": "keyword"},
                        "s3_url": {"type": "keyword"},
                        "archived_at": {"type": "date"},
                        "status": {"type": "keyword"}
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

def search_documents(query_string, size=10):
    """Search documents in Elasticsearch"""
    try:
        search_body = {
            "query": {
                "multi_match": {
                    "query": query_string,
                    "fields": ["filename", "content_type"],
                    "fuzziness": "AUTO"
                }
            },
            "size": size
        }
        
        response = es_client.search(index=INDEX_NAME, body=search_body)
        
        # Extract hits from response
        hits = response.get("hits", {}).get("hits", [])
        results = []
        
        for hit in hits:
            source = hit.get("_source", {})
            source["_score"] = hit.get("_score", 0)
            results.append(source)
        
        print(f"✅ Found {len(results)} documents matching query: {query_string}")
        return {
            "total": response.get("hits", {}).get("total", {}).get("value", 0),
            "results": results
        }
        
    except Exception as e:
        print(f"❌ Error searching documents in Elasticsearch: {e}")
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
        if info is not None:  # FIXED: Explicit None check
            print("✅ Successfully connected to Elasticsearch")
            return True
        else:
            print("❌ Elasticsearch connection failed: No response")
            return False
    except Exception as e:
        print(f"❌ Elasticsearch connection failed: {e}")
        return False