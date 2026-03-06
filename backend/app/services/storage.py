"""Storage service with Firebase Cloud Storage + local filesystem fallback."""
import logging
import os
from datetime import timedelta
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

# Global bucket reference
_bucket = None
_use_local = False

# Local storage base directory
LOCAL_STORAGE_DIR = Path(settings.UPLOAD_DIR) / "storage"
LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def get_storage_bucket():
    """Get Firebase Storage bucket, falling back to local storage."""
    global _bucket, _use_local
    if _use_local:
        return None
    if _bucket is None:
        bucket_name = settings.FIREBASE_STORAGE_BUCKET
        if not bucket_name:
            logger.warning("FIREBASE_STORAGE_BUCKET not configured — using local storage")
            _use_local = True
            return None
        try:
            from firebase_admin import storage
            _bucket = storage.bucket(bucket_name)
            # Quick check: try to access bucket metadata
            logger.info(f"Firebase Storage bucket initialized: {bucket_name}")
        except Exception as e:
            logger.warning(f"Firebase Storage unavailable ({e}) — using local storage")
            _use_local = True
            return None
    return _bucket


def upload_to_storage(file_data: bytes, storage_path: str, content_type: str) -> str:
    """
    Upload file bytes to Firebase Cloud Storage or local filesystem.
    
    Args:
        file_data: Raw file bytes
        storage_path: Path in the bucket (e.g., "documents/user_id/doc_id_filename")
        content_type: MIME type of the file
    
    Returns:
        Storage path reference
    """
    bucket = get_storage_bucket()

    if bucket is not None:
        try:
            blob = bucket.blob(storage_path)
            blob.upload_from_string(file_data, content_type=content_type)
            logger.info(f"Uploaded {len(file_data)} bytes to gs://{bucket.name}/{storage_path}")
            return f"gs://{bucket.name}/{storage_path}"
        except Exception as e:
            logger.warning(f"Cloud upload failed ({e}) — falling back to local storage")

    # Local filesystem fallback
    return _upload_local(file_data, storage_path)


def _upload_local(file_data: bytes, storage_path: str) -> str:
    """Save file to local filesystem."""
    local_path = LOCAL_STORAGE_DIR / storage_path
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(file_data)
    logger.info(f"Saved {len(file_data)} bytes locally to {local_path}")
    return f"local://{storage_path}"


def get_download_url(storage_path: str, expiration_minutes: int = 60) -> str:
    """
    Generate a download URL for a file.
    
    For cloud storage: signed URL.
    For local storage: local API path.
    """
    if storage_path.startswith("local://"):
        # Return a relative API path for local files
        clean_path = storage_path.replace("local://", "")
        return f"/api/v1/documents/file/{clean_path}"

    bucket = get_storage_bucket()
    if bucket is None:
        clean_path = storage_path
        if clean_path.startswith("gs://"):
            parts = clean_path.split("/", 3)
            clean_path = parts[3] if len(parts) > 3 else ""
        return f"/api/v1/documents/file/{clean_path}"

    # Strip gs:// prefix if present
    clean_path = storage_path
    if clean_path.startswith("gs://"):
        parts = clean_path.split("/", 3)
        clean_path = parts[3] if len(parts) > 3 else ""
    
    try:
        blob = bucket.blob(clean_path)
        url = blob.generate_signed_url(
            expiration=timedelta(minutes=expiration_minutes),
            method="GET",
        )
        return url
    except Exception as e:
        logger.warning(f"Could not generate signed URL: {e}")
        return f"/api/v1/documents/file/{clean_path}"


def delete_from_storage(storage_path: str) -> bool:
    """
    Delete a file from storage.
    """
    if storage_path.startswith("local://"):
        clean_path = storage_path.replace("local://", "")
        local_path = LOCAL_STORAGE_DIR / clean_path
        if local_path.exists():
            local_path.unlink()
            logger.info(f"Deleted local file: {local_path}")
            return True
        logger.warning(f"Local file not found: {local_path}")
        return False

    bucket = get_storage_bucket()
    if bucket is None:
        return False

    clean_path = storage_path
    if clean_path.startswith("gs://"):
        parts = clean_path.split("/", 3)
        clean_path = parts[3] if len(parts) > 3 else ""
    
    try:
        blob = bucket.blob(clean_path)
        if blob.exists():
            blob.delete()
            logger.info(f"Deleted from storage: {clean_path}")
            return True
        logger.warning(f"File not found in storage: {clean_path}")
    except Exception as e:
        logger.warning(f"Delete failed: {e}")
    return False


def download_from_storage(storage_path: str) -> Optional[bytes]:
    """
    Download file bytes from storage.
    """
    logger.info(f"download_from_storage called with: {storage_path}")
    
    if storage_path.startswith("local://"):
        clean_path = storage_path.replace("local://", "")
        local_path = LOCAL_STORAGE_DIR / clean_path
        logger.info(f"Local path resolved to: {local_path}, exists={local_path.exists()}")
        if local_path.exists():
            data = local_path.read_bytes()
            logger.info(f"Read {len(data)} bytes from local storage")
            return data
        return None
    
    # Also try local storage as fallback for any path
    # (file may have been uploaded locally even if path doesn't start with local://)
    local_fallback = LOCAL_STORAGE_DIR / storage_path
    if local_fallback.exists():
        data = local_fallback.read_bytes()
        logger.info(f"Found in local fallback: {local_fallback} ({len(data)} bytes)")
        return data

    bucket = get_storage_bucket()
    if bucket is None:
        logger.warning("No storage bucket available and file not found locally")
        return None

    clean_path = storage_path
    if clean_path.startswith("gs://"):
        parts = clean_path.split("/", 3)
        clean_path = parts[3] if len(parts) > 3 else ""
    
    try:
        blob = bucket.blob(clean_path)
        if not blob.exists():
            logger.warning(f"Blob not found in cloud storage: {clean_path}")
            return None
        data = blob.download_as_bytes()
        logger.info(f"Downloaded {len(data)} bytes from cloud storage")
        return data
    except Exception as e:
        logger.warning(f"Cloud download failed: {e}")
        return None
