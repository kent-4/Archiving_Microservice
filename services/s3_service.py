# In services/s3_service.py

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from config import AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME

s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY
)

def upload_to_s3(file_obj, filename):
    """
    Uploads a file object to the configured S3 bucket.
    """
    if not S3_BUCKET_NAME:
        raise ValueError("S3_BUCKET_NAME is not configured.")

    try:
        s3_client.upload_fileobj(
            file_obj,
            S3_BUCKET_NAME,
            filename
        )
        s3_url = f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{filename}"
        return s3_url
    # --- IMPROVED ERROR HANDLING ---
    except NoCredentialsError:
        print("!!! S3 Critical Error: Credentials not available.")
        # Re-raising as a more generic error for the API layer to handle
        raise ValueError("Server is not configured with valid S3 credentials.")
    except ClientError as e:
        # This catches specific AWS-related errors like "Access Denied" or "NoSuchBucket"
        error_code = e.response['Error']['Code']
        print(f"!!! S3 Client Error ({error_code}): {e.response['Error']['Message']}")
        raise ValueError(f"An S3 error occurred: {error_code}")


def create_presigned_url(object_name, expiration=3600):
    """
    Generate a presigned URL to share an S3 object.
    """
    if not S3_BUCKET_NAME:
        raise ValueError("S3_BUCKET_NAME is not configured.")
        
    try:
        response = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': S3_BUCKET_NAME,
                                                            'Key': object_name},
                                                    ExpiresIn=expiration)
        return response
    except ClientError as e:
        print(f"!!! S3 Client Error generating presigned URL: {e}")
        return None