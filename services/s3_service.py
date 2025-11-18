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
    Uploads a file object (for small files) to the configured S3 bucket.
    This is a streaming upload, not multipart.
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
    except NoCredentialsError:
        print("!!! S3 Critical Error: Credentials not available.")
        raise ValueError("Server is not configured with valid S3 credentials.")
    except ClientError as e:
        error_code = e.response['Error']['Code']
        print(f"!!! S3 Client Error ({error_code}): {e.response['Error']['Message']}")
        raise ValueError(f"An S3 error occurred: {error_code}")


def create_presigned_url(object_name, expiration=3600):
    """
    Generate a presigned URL to download an S3 object.
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

# --- NEW FUNCTIONS FOR MULTIPART UPLOAD ---

def create_multipart_upload(filename):
    """
    Initiates a multipart upload with S3 and returns an UploadId.
    """
    if not S3_BUCKET_NAME:
        raise ValueError("S3_BUCKET_NAME is not configured.")
    
    try:
        response = s3_client.create_multipart_upload(
            Bucket=S3_BUCKET_NAME,
            Key=filename
        )
        return response['UploadId']
    except ClientError as e:
        print(f"!!! S3 Client Error creating multipart upload: {e}")
        raise ValueError(f"Could not initiate multipart upload: {e}")

def generate_presigned_part_url(upload_id, filename, part_number, expiration=3600):
    """
    Generates a presigned URL for a single part of a multipart upload.
    """
    if not S3_BUCKET_NAME:
        raise ValueError("S3_BUCKET_NAME is not configured.")
        
    try:
        response = s3_client.generate_presigned_url(
            'upload_part',
            Params={
                'Bucket': S3_BUCKET_NAME,
                'Key': filename,
                'UploadId': upload_id,
                'PartNumber': part_number
            },
            ExpiresIn=expiration
        )
        return response
    except ClientError as e:
        print(f"!!! S3 Client Error generating part URL: {e}")
        return None

def complete_multipart_upload(upload_id, filename, parts):
    """
    Finalizes a multipart upload by assembling the uploaded parts.
    'parts' must be a list of dicts: [{'ETag': '...', 'PartNumber': ...}]
    """
    if not S3_BUCKET_NAME:
        raise ValueError("S3_BUCKET_NAME is not configured.")
        
    try:
        response = s3_client.complete_multipart_upload(
            Bucket=S3_BUCKET_NAME,
            Key=filename,
            UploadId=upload_id,
            MultipartUpload={'Parts': parts}
        )
        # Returns the full S3 URL
        return response['Location']
    except ClientError as e:
        print(f"!!! S3 Client Error completing upload: {e}")
        raise ValueError(f"Could not complete multipart upload: {e}")

def abort_multipart_upload(upload_id, filename):
    """
    Aborts an in-progress multipart upload to clean up.
    """
    if not S3_BUCKET_NAME:
        raise ValueError("S3_BUCKET_NAME is not configured.")
    
    try:
        s3_client.abort_multipart_upload(
            Bucket=S3_BUCKET_NAME,
            Key=filename,
            UploadId=upload_id
        )
        print(f"Aborted upload {upload_id} for {filename}")
    except ClientError as e:
        print(f"!!! S3 Client Error aborting upload: {e}")
        # Don't raise here, as this is a cleanup function

def upload_profile_picture(file_obj, user_id, content_type):
    """
    Uploads a user's profile picture to a specific folder in S3.
    The filename will be the user's ID to ensure uniqueness.
    """
    if not S3_BUCKET_NAME:
        raise ValueError("S3_BUCKET_NAME is not configured.")

    s3_key = f"profile-pictures/{user_id}"

    try:
        s3_client.upload_fileobj(
            file_obj,
            S3_BUCKET_NAME,
            s3_key,
            ExtraArgs={'ContentType': content_type}
        )
        s3_url = f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{s3_key}"
        return s3_url
    except NoCredentialsError:
        print("!!! S3 Critical Error: Credentials not available.")
        raise ValueError("Server is not configured with valid S3 credentials.")
    except ClientError as e:
        error_code = e.response['Error']['Code']
        print(f"!!! S3 Client Error ({error_code}): {e.response['Error']['Message']}")
        raise ValueError(f"An S3 error occurred: {error_code}")