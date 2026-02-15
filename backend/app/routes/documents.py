"""Document management routes with Firebase Cloud Storage and OCR."""
import hashlib
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from uuid import uuid4

from fastapi import (
    APIRouter, Depends, File, HTTPException, Query, 
    UploadFile, status,
)
from fastapi.responses import Response
from pydantic import BaseModel

from app.config import settings
from app.core.auth import get_current_user
from app.core.exceptions import NotFoundError, ValidationError
from app.services.firebase import get_db
from app.services.storage import upload_to_storage, get_download_url, download_from_storage, delete_from_storage
from app.services.ocr import ocr_service
from app.services.ai import ai_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Documents"])


class DocumentResponse(BaseModel):
    """Document response model."""
    id: str
    filename: str
    document_type: str
    mime_type: str
    file_size: int
    ocr_text: str | None = None
    ocr_confidence: float | None = None
    content_hash: str | None = None
    blockchain_tx_hash: str | None = None
    blockchain_block_number: int | None = None
    blockchain_anchored_at: str | None = None
    status: str
    created_at: str
    updated_at: str


class DocumentListResponse(BaseModel):
    """Paginated document list response."""
    documents: list[DocumentResponse]
    total: int
    page: int
    per_page: int


def compute_hash(data: bytes) -> str:
    """Compute SHA-256 hash of data."""
    return hashlib.sha256(data).hexdigest()


@router.post("", status_code=status.HTTP_201_CREATED, response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    document_type: Optional[str] = Query(None, description="Document type (lab_report, prescription, imaging, other)"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Upload a medical document.
    
    Supports PDF and image files. Automatically extracts text using OCR.
    
    - **file**: The document file to upload
    - **document_type**: Optional classification (lab_report, prescription, imaging, other)
    """
    # Validate file type
    if file.content_type not in settings.ALLOWED_MIME_TYPES:
        raise ValidationError(
            f"Unsupported file type: {file.content_type}. "
            f"Allowed: {', '.join(settings.ALLOWED_MIME_TYPES)}"
        )
    
    # Read file data
    file_data = await file.read()
    file_size = len(file_data)
    
    # Check file size
    max_size_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if file_size > max_size_bytes:
        raise ValidationError(
            f"File too large ({file_size / 1024 / 1024:.1f}MB). "
            f"Maximum: {settings.MAX_FILE_SIZE_MB}MB"
        )
    
    # Generate document ID and compute hash
    doc_id = str(uuid4())
    content_hash = compute_hash(file_data)
    
    # Extract text using OCR
    logger.info(f"Starting OCR for document {doc_id}")
    ocr_result = await ocr_service.extract_text(file_data, file.content_type)
    
    # Store file in Firebase Cloud Storage
    safe_filename = file.filename.replace("/", "_").replace("\\", "_")
    cloud_path = f"documents/{current_user['id']}/{doc_id}_{safe_filename}"
    storage_uri = upload_to_storage(file_data, cloud_path, file.content_type)
    
    logger.info(f"Saved file to {storage_uri}")
    
    # Prepare document data
    now = datetime.utcnow().isoformat()
    doc_data = {
        "id": doc_id,
        "user_id": current_user["id"],
        "filename": file.filename,
        "document_type": document_type or "other",
        "mime_type": file.content_type,
        "file_size": file_size,
        "content_hash": content_hash,
        "storage_path": cloud_path,
        "ocr_text": ocr_result.text[:15000] if ocr_result.text else "",  # Limit stored text
        "ocr_confidence": ocr_result.confidence,
        "ocr_method": ocr_result.method,
        "status": "ready",
        "created_at": now,
        "updated_at": now,
    }
    
    # Save to Firestore
    db = get_db()
    db.collection("documents").document(doc_id).set(doc_data)
    
    logger.info(
        f"Document uploaded: {doc_id}, "
        f"OCR: {len(ocr_result.text)} chars, {ocr_result.confidence:.1%} confidence"
    )
    
    return DocumentResponse(
        id=doc_id,
        filename=file.filename,
        document_type=doc_data["document_type"],
        mime_type=file.content_type,
        file_size=file_size,
        ocr_text=doc_data["ocr_text"] if len(doc_data["ocr_text"]) < 1000 else doc_data["ocr_text"][:1000] + "...",
        ocr_confidence=ocr_result.confidence,
        content_hash=content_hash,
        status="ready",
        created_at=now,
        updated_at=now,
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    document_type: Optional[str] = Query(None, description="Filter by document type"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    List user's documents with pagination.
    
    - **page**: Page number (starts at 1)
    - **per_page**: Number of documents per page (max 100)
    - **document_type**: Optional filter by document type
    """
    db = get_db()
    user_id = current_user["id"]
    
    # Query documents
    query = db.collection("documents").where("user_id", "==", user_id)
    
    if document_type:
        query = query.where("document_type", "==", document_type)
    
    # Get all matching documents
    all_docs = []
    for doc in query.stream():
        doc_data = doc.to_dict()
        if doc_data.get("status") != "deleted":
            all_docs.append(doc_data)
    
    # Sort by created_at descending
    all_docs.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    
    # Paginate
    total = len(all_docs)
    start = (page - 1) * per_page
    end = start + per_page
    page_docs = all_docs[start:end]
    
    # Convert to response model
    documents = []
    for d in page_docs:
        ocr_preview = d.get("ocr_text", "")
        if ocr_preview and len(ocr_preview) > 200:
            ocr_preview = ocr_preview[:200] + "..."
        
        documents.append(DocumentResponse(
            id=d["id"],
            filename=d["filename"],
            document_type=d.get("document_type", "other"),
            mime_type=d["mime_type"],
            file_size=d["file_size"],
            ocr_text=ocr_preview,
            ocr_confidence=d.get("ocr_confidence"),
            content_hash=d.get("content_hash"),
            blockchain_tx_hash=d.get("blockchain_tx_hash"),
            blockchain_block_number=d.get("blockchain_block_number"),
            blockchain_anchored_at=d.get("blockchain_anchored_at"),
            status=d.get("status", "ready"),
            created_at=d["created_at"],
            updated_at=d.get("updated_at", d["created_at"]),
        ))
    
    return DocumentListResponse(
        documents=documents,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get document details including full OCR text."""
    db = get_db()
    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise NotFoundError("Document")
    
    doc_data = doc.to_dict()
    
    # Authorization check
    if doc_data.get("user_id") != current_user["id"]:
        raise NotFoundError("Document")
    
    if doc_data.get("status") == "deleted":
        raise NotFoundError("Document")
    
    return DocumentResponse(
        id=doc_data["id"],
        filename=doc_data["filename"],
        document_type=doc_data.get("document_type", "other"),
        mime_type=doc_data["mime_type"],
        file_size=doc_data["file_size"],
        ocr_text=doc_data.get("ocr_text"),
        ocr_confidence=doc_data.get("ocr_confidence"),
        content_hash=doc_data.get("content_hash"),
        blockchain_tx_hash=doc_data.get("blockchain_tx_hash"),
        blockchain_block_number=doc_data.get("blockchain_block_number"),
        blockchain_anchored_at=doc_data.get("blockchain_anchored_at"),
        status=doc_data.get("status", "ready"),
        created_at=doc_data["created_at"],
        updated_at=doc_data.get("updated_at", doc_data["created_at"]),
    )


@router.get("/{document_id}/text")
async def get_document_text(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get full OCR text for a document."""
    db = get_db()
    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise NotFoundError("Document")
    
    doc_data = doc.to_dict()
    
    if doc_data.get("user_id") != current_user["id"]:
        raise NotFoundError("Document")
    
    return {
        "document_id": document_id,
        "filename": doc_data["filename"],
        "text": doc_data.get("ocr_text", ""),
        "confidence": doc_data.get("ocr_confidence", 0),
        "method": doc_data.get("ocr_method", "unknown"),
    }


@router.get("/{document_id}/download")
async def download_document(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Download the original document file."""
    db = get_db()
    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise NotFoundError("Document")
    
    doc_data = doc.to_dict()
    
    if doc_data.get("user_id") != current_user["id"]:
        raise NotFoundError("Document")
    
    storage_path = doc_data.get("storage_path")
    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not available for download"
        )
    
    # Download from Firebase Storage and serve
    file_bytes = download_from_storage(storage_path)
    if file_bytes is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found in cloud storage"
        )
    
    return Response(
        content=file_bytes,
        media_type=doc_data["mime_type"],
        headers={
            "Content-Disposition": f'attachment; filename="{doc_data["filename"]}"'
        },
    )


@router.get("/{document_id}/url")
async def get_document_url(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get a signed download/preview URL for the document. Works for both owner and linked doctors."""
    db = get_db()
    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise NotFoundError("Document")
    
    doc_data = doc.to_dict()
    user_id = current_user["id"]
    
    # Allow owner or linked doctor
    is_owner = doc_data.get("user_id") == user_id
    is_linked_doctor = False
    if not is_owner:
        # Check if user is a doctor linked to the document owner
        links = db.collection("doctor_patients") \
            .where("doctor_id", "==", user_id) \
            .where("patient_id", "==", doc_data.get("user_id")) \
            .where("status", "==", "active") \
            .stream()
        is_linked_doctor = any(True for _ in links)
    
    if not is_owner and not is_linked_doctor:
        raise NotFoundError("Document")
    
    storage_path = doc_data.get("storage_path")
    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not available"
        )
    
    url = get_download_url(storage_path, expiration_minutes=60)
    return {
        "document_id": document_id,
        "filename": doc_data["filename"],
        "mime_type": doc_data["mime_type"],
        "download_url": url,
        "expires_in_minutes": 60,
    }

@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Soft delete a document (marks as deleted)."""
    db = get_db()
    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise NotFoundError("Document")
    
    doc_data = doc.to_dict()
    
    if doc_data.get("user_id") != current_user["id"]:
        raise NotFoundError("Document")
    
    # Soft delete
    doc_ref.update({
        "status": "deleted",
        "updated_at": datetime.utcnow().isoformat(),
    })
    
    # Cascade: delete associated health records
    hr_query = (
        db.collection("health_records")
        .where("user_id", "==", current_user["id"])
        .where("document_id", "==", document_id)
    )
    deleted_hr = 0
    for hr_doc in hr_query.stream():
        db.collection("health_records").document(hr_doc.id).delete()
        deleted_hr += 1
    
    logger.info(
        f"Document deleted: {document_id}, "
        f"cascade-deleted {deleted_hr} health records"
    )
    
    return {"message": "Document deleted", "id": document_id}


@router.post("/{document_id}/analyze")
async def analyze_document(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Analyze document and extract structured health data.
    
    Uses AI to extract lab values, medications, and other health data.
    """
    db = get_db()
    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise NotFoundError("Document")
    
    doc_data = doc.to_dict()
    
    if doc_data.get("user_id") != current_user["id"]:
        raise NotFoundError("Document")
    
    ocr_text = doc_data.get("ocr_text", "")
    if not ocr_text:
        return {
            "document_id": document_id,
            "records": [],
            "message": "No text available for analysis"
        }
    
    # Extract structured health data
    records = await ai_service.extract_health_data(ocr_text)
    
    # Store analysis results
    doc_ref.update({
        "analysis": {
            "records": records,
            "analyzed_at": datetime.utcnow().isoformat(),
        },
        "updated_at": datetime.utcnow().isoformat(),
    })
    
    return {
        "document_id": document_id,
        "filename": doc_data["filename"],
        "records": records,
        "record_count": len(records),
    }


@router.post("/{document_id}/verify")
async def verify_document(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Verify document integrity by recomputing content hash.
    
    Compares the stored hash with the current file hash to detect tampering.
    """
    db = get_db()
    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise NotFoundError("Document")
    
    doc_data = doc.to_dict()
    
    if doc_data.get("user_id") != current_user["id"]:
        raise NotFoundError("Document")
    
    stored_hash = doc_data.get("content_hash", "")
    storage_path = doc_data.get("storage_path", "")
    
    is_valid = False
    current_hash = ""
    
    if storage_path:
        file_data = download_from_storage(storage_path)
        if file_data:
            current_hash = compute_hash(file_data)
            is_valid = current_hash == stored_hash
    
    # Update verification status
    now = datetime.utcnow().isoformat()
    doc_ref.update({
        "last_verified_at": now,
        "integrity_valid": is_valid,
        "updated_at": now,
    })
    
    logger.info(
        f"Document verified: {document_id}, valid={is_valid}"
    )
    
    return {
        "document_id": document_id,
        "is_valid": is_valid,
        "stored_hash": stored_hash,
        "current_hash": current_hash,
        "verified_at": now,
    }
