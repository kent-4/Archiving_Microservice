# In services/redis_service.py

import redis
import json
from config import REDIS_HOST, REDIS_PORT

try:
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    redis_client.ping()
    print("Successfully connected to Redis.")
except redis.exceptions.ConnectionError as e:
    print(f"!!! Critical Error: Could not connect to Redis. Caching will be disabled. Error: {e}")
    redis_client = None

CACHE_EXPIRATION_SECONDS = 3600

def get_from_cache(key):
    if not redis_client:
        return None
        
    try:
        cached_data = redis_client.get(key)
        if cached_data:
            print(f"Cache HIT for key: {key}")
            return json.loads(cached_data)
        else:
            print(f"Cache MISS for key: {key}")
            return None
    except redis.exceptions.RedisError as e:
        print(f"Warning: Redis GET command failed. Error: {e}")
        return None

def set_to_cache(key, value):
    if not redis_client:
        return

    try:
        serialized_value = json.dumps(value)
        redis_client.setex(key, CACHE_EXPIRATION_SECONDS, serialized_value)
        print(f"Successfully cached data for key: {key}")
    # --- THIS IS THE FIX ---
    # Catch both Redis errors and TypeErrors from JSON serialization.
    except (redis.exceptions.RedisError, TypeError) as e:
        print(f"Warning: Redis SET command failed. Value might not be JSON serializable. Error: {e}")