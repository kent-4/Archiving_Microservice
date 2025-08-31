# In services/elasticsearch_service.py

from elasticsearch import Elasticsearch
from elasticsearch import ApiError # Use ApiError for version 8+
from config import ELASTICSEARCH_HOST

# Initialize the Elasticsearch client
es_client = Elasticsearch(hosts=[ELASTICSEARCH_HOST])
ARCHIVE_INDEX = "archives" # Name of the index

def check_connection():
    """Checks if the connection to Elasticsearch is established."""
    return es_client.ping()

def create_index_if_not_exists():
    """Creates the 'archives' index with an explicit mapping if it doesn't already exist."""
    if not es_client.indices.exists(index=ARCHIVE_INDEX):
        try:
            # --- PERFORMANCE IMPROVEMENT ---
            # Define an explicit mapping for more efficient storage and accurate searching.
            mapping = {
                "properties": {
                    "file_id": {"type": "keyword"},
                    "filename": {"type": "text"},
                    "s3_url": {"type": "keyword"},
                    "content_type": {"type": "keyword"},
                    "archived_at": {"type": "date"},
                    "status": {"type": "keyword"}
                }
            }
            es_client.indices.create(index=ARCHIVE_INDEX, mappings=mapping)
            print(f"Index '{ARCHIVE_INDEX}' created with explicit mapping.")
        except ApiError as e: # Catch the correct exception
            print(f"!!! Critical Error creating Elasticsearch index: {e}")
            raise

def index_document(document):
    """Indexes a metadata document in Elasticsearch."""
    try:
        doc_id = document.get("file_id")
        
        if "_id" in document:
            del document["_id"]
        
        # In ES v8+, the 'body' parameter is renamed to 'document'
        es_client.index(index=ARCHIVE_INDEX, id=doc_id, document=document)
        print(f"Document {doc_id} indexed successfully in Elasticsearch.")
    except ApiError as e: # Catch the correct exception
        print(f"!!! Critical Error indexing document in Elasticsearch: {e}")
        # This 'raise' will propagate the error up to the archiving_service
        raise

def search_documents(query_string):
    """Searches for documents in the 'archives' index."""
    try:
        query = {
            "query": {
                "multi_match": {
                    "query": query_string,
                    "fields": ["filename", "content_type"]
                }
            }
        }
        # In ES v8+, the 'body' parameter is renamed to 'query' for the search method
        response = es_client.search(index=ARCHIVE_INDEX, query=query['query'])
        hits = [hit['_source'] for hit in response['hits']['hits']]
        return hits
    except ApiError as e: # Catch the correct exception
        print(f"!!! Critical Error searching Elasticsearch: {e}")
        raise