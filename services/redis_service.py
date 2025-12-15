# In services/redis_service.py

import redis
import json
from config import REDIS_URL, REDIS_HOST, REDIS_PORT

# Initialize Redis client
if REDIS_URL:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
else:
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)


def test_redis_connection():
    """Test Redis connection"""
    try:
        redis_client.ping()
        print("✅ Successfully connected to Redis")
        return True
    except redis.ConnectionError as e:
        print(f"❌ Redis connection failed: {e}")
        return False

def set_to_cache(key, value, expiration=3600):
    """
    Cache a value with an expiration time (default 1 hour).
    """
    try:
        # Convert value to JSON string for storage
        json_value = json.dumps(value)
        redis_client.setex(key, expiration, json_value)
        print(f"✅ Cached value for key: {key}")
    except Exception as e:
        print(f"❌ Error caching value for key {key}: {e}")

def get_from_cache(key):
    """
    Retrieve a value from cache.
    """
    try:
        cached_value = redis_client.get(key)
        if cached_value is not None:  # FIXED: Explicit None check
            # Parse JSON string back to Python object
            return json.loads(cached_value)
        return None
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing cached value for key {key}: {e}")
        return None
    except Exception as e:
        print(f"❌ Error retrieving cached value for key {key}: {e}")
        return None

def delete_from_cache(key):
    """
    Delete a value from cache.
    """
    try:
        result = redis_client.delete(key)
        if result > 0:
            print(f"✅ Deleted cached value for key: {key}")
        else:
            print(f"⚠️  No cached value found for key: {key}")
        return result > 0
    except Exception as e:
        print(f"❌ Error deleting cached value for key {key}: {e}")
        return False