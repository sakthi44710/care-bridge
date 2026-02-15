"""Firebase Cloud Storage service for document file storage."""
import logging
from datetime import timedelta
from typing import Optional

from firebase_admin import storage

from app.config import settings

logger = logging.getLogger(__name__)

# Global bucket reference
_bucket = None


def get_storage_bucket():
    """Get Firebase Storage bucket, initializing if needed."""
    global _bucket
    if _bucket is None:
        bucket_name = settings.FIREBASE_STORAGE_BUCKET
        if not bucket_name:
            raise RuntimeError("FIREBASE_STORAGE_BUCKET not configured")
        _bucket = storage.bucket(bucket_name)
        logger.info(f"Firebase Storage bucket initialized: {bucket_name}")
    return _bucket


def upload_to_storage(file_data: bytes, storage_path: str, content_type: str) -> str:
    """
    Upload file bytes to Firebase Cloud Storage.
    
    Args:
        file_data: Raw file bytes
        storage_path: Path in the bucket (e.g., "documents/user_id/doc_id_filename")
        content_type: MIME type of the file
    
    Returns:
        Storage path (gs:// style reference)
    """
    bucket = get_storage_bucket()
    blob = bucket.blob(storage_path)
    blob.upload_from_string(file_data, content_type=content_type)
    logger.info(f"Uploaded {len(file_data)} bytes to gs://{bucket.name}/{storage_path}")
    return f"gs://{bucket.name}/{storage_path}"


def get_download_url(storage_path: str, expiration_minutes: int = 60) -> str:
    """
    Generate a signed download URL for a file in Firebase Storage.
    
    Args:
        storage_path: Path in the bucket (without gs:// prefix)
        expiration_minutes: URL validity in minutes (default 60)
    
    Returns:
        Signed URL string
    """
    bucket = get_storage_bucket()
    # Strip gs:// prefix if present
    clean_path = storage_path
    if clean_path.startswith("gs://"):
        # Remove gs://bucket_name/ prefix
        parts = clean_path.split("/", 3)
        clean_path = parts[3] if len(parts) > 3 else ""
    
    blob = bucket.blob(clean_path)
    url = blob.generate_signed_url(
        expiration=timedelta(minutes=expiration_minutes),
        method="GET",
    )
    return url


def delete_from_storage(storage_path: str) -> bool:
    """
    Delete a file from Firebase Storage.
    
    Args:
        storage_path: Path in the bucket
    
    Returns:
        True if deleted, False if not found
    """
    bucket = get_storage_bucket()
    clean_path = storage_path
    if clean_path.startswith("gs://"):
        parts = clean_path.split("/", 3)
        clean_path = parts[3] if len(parts) > 3 else ""
    
    blob = bucket.blob(clean_path)
    if blob.exists():
        blob.delete()
        logger.info(f"Deleted from storage: {clean_path}")
        return True
    logger.warning(f"File not found in storage: {clean_path}")
    return False


def download_from_storage(storage_path: str) -> Optional[bytes]:
    """
    Download file bytes from Firebase Storage.
    
    Args:
        storage_path: Path in the bucket
    
    Returns:
        File bytes or None if not found
    """
    bucket = get_storage_bucket()
    clean_path = storage_path
    if clean_path.startswith("gs://"):
        parts = clean_path.split("/", 3)
        clean_path = parts[3] if len(parts) > 3 else ""
    
    blob = bucket.blob(clean_path)
    if not blob.exists():
        return None
    return blob.download_as_bytes()
