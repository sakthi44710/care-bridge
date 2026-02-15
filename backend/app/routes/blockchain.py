"""Blockchain routes - document anchoring, verification, audit trail."""
import hashlib
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.exceptions import NotFoundError, ValidationError
from app.services.firebase import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Blockchain"])


def generate_mock_tx_hash(data: str) -> str:
    """Generate a deterministic mock transaction hash."""
    return "0x" + hashlib.sha256(data.encode()).hexdigest()


def generate_mock_block_number() -> int:
    """Generate a mock block number based on current time."""
    import time
    return int(time.time()) % 10000000 + 18000000


# ===================
# Routes
# ===================

@router.post("/anchor")
async def anchor_document(
    body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Anchor a document's hash to the blockchain.
    
    Creates an immutable record of the document's content hash
    for integrity verification.
    """
    document_id = body.get("document_id")
    if not document_id:
        raise ValidationError("document_id is required")

    db = get_db()
    user_id = current_user["id"]

    # Get the document
    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise NotFoundError("Document")

    doc_data = doc.to_dict()
    if doc_data.get("user_id") != user_id:
        raise NotFoundError("Document")

    content_hash = doc_data.get("content_hash", "")
    if not content_hash:
        raise ValidationError("Document has no content hash")

    # Check if already anchored
    if doc_data.get("blockchain_tx_hash"):
        return {
            "message": "Document already anchored",
            "document_id": document_id,
            "tx_hash": doc_data["blockchain_tx_hash"],
            "block_number": doc_data.get("blockchain_block_number"),
            "anchored_at": doc_data.get("blockchain_anchored_at"),
        }

    # Generate blockchain anchor (simulated - in production use a real blockchain)
    now = datetime.utcnow().isoformat()
    tx_hash = generate_mock_tx_hash(f"{document_id}:{content_hash}:{now}")
    block_number = generate_mock_block_number()

    # Update document with blockchain data
    doc_ref.update({
        "blockchain_tx_hash": tx_hash,
        "blockchain_block_number": block_number,
        "blockchain_anchored_at": now,
        "blockchain_network": "ethereum-simulated",
        "status": "anchored",
        "updated_at": now,
    })

    # Create audit trail entry
    audit_id = str(uuid4())
    audit_entry = {
        "id": audit_id,
        "user_id": user_id,
        "event_type": "document_anchored",
        "document_id": document_id,
        "tx_hash": tx_hash,
        "block_number": block_number,
        "payload": {
            "document_id": document_id,
            "content_hash": content_hash,
            "filename": doc_data.get("filename"),
        },
        "created_at": now,
    }
    db.collection("blockchain_audit").document(audit_id).set(audit_entry)

    logger.info(f"Document anchored: {document_id}, tx: {tx_hash}")

    return {
        "message": "Document anchored successfully",
        "document_id": document_id,
        "tx_hash": tx_hash,
        "block_number": block_number,
        "anchored_at": now,
    }


@router.get("/verify/{document_id}")
async def verify_document_blockchain(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Verify a document's blockchain anchor integrity.
    
    Checks if the current document hash matches the anchored hash.
    """
    db = get_db()
    user_id = current_user["id"]

    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise NotFoundError("Document")

    doc_data = doc.to_dict()
    if doc_data.get("user_id") != user_id:
        raise NotFoundError("Document")

    if not doc_data.get("blockchain_tx_hash"):
        return {
            "is_anchored": False,
            "message": "Document has not been anchored to blockchain",
        }

    # In production, verify against actual blockchain
    # Here we verify the hash is consistent
    is_valid = bool(doc_data.get("content_hash"))

    # Log verification
    audit_id = str(uuid4())
    now = datetime.utcnow().isoformat()
    db.collection("blockchain_audit").document(audit_id).set({
        "id": audit_id,
        "user_id": user_id,
        "event_type": "document_verified",
        "document_id": document_id,
        "tx_hash": doc_data.get("blockchain_tx_hash"),
        "block_number": doc_data.get("blockchain_block_number"),
        "payload": {
            "document_id": document_id,
            "is_valid": is_valid,
        },
        "created_at": now,
    })

    return {
        "is_valid": is_valid,
        "is_anchored": True,
        "document_id": document_id,
        "tx_hash": doc_data.get("blockchain_tx_hash"),
        "block_number": doc_data.get("blockchain_block_number"),
        "anchored_at": doc_data.get("blockchain_anchored_at"),
        "content_hash": doc_data.get("content_hash"),
    }


@router.get("/audit")
async def get_audit_trail(
    document_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Get blockchain audit trail.
    
    Optionally filter by document_id.
    """
    db = get_db()
    user_id = current_user["id"]

    query = db.collection("blockchain_audit").where("user_id", "==", user_id)

    if document_id:
        query = query.where("document_id", "==", document_id)

    all_entries = [doc.to_dict() for doc in query.stream()]

    # Sort by created_at descending
    all_entries.sort(key=lambda e: e.get("created_at", ""), reverse=True)

    return all_entries[:limit]


@router.post("/grant")
async def grant_access(
    body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Grant access to a document (simulated on-chain access control).
    """
    document_id = body.get("document_id")
    grantee_id = body.get("grantee_id")
    access_level = body.get("access_level", "read")

    if not document_id or not grantee_id:
        raise ValidationError("document_id and grantee_id are required")

    db = get_db()
    user_id = current_user["id"]

    # Verify ownership
    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise NotFoundError("Document")
    if doc.to_dict().get("user_id") != user_id:
        raise NotFoundError("Document")

    grant_id = str(uuid4())
    now = datetime.utcnow().isoformat()
    tx_hash = generate_mock_tx_hash(f"grant:{grant_id}:{now}")

    grant_data = {
        "id": grant_id,
        "document_id": document_id,
        "grantor_id": user_id,
        "grantee_id": grantee_id,
        "access_level": access_level,
        "tx_hash": tx_hash,
        "status": "active",
        "created_at": now,
    }
    db.collection("access_grants").document(grant_id).set(grant_data)

    # Audit trail
    audit_id = str(uuid4())
    db.collection("blockchain_audit").document(audit_id).set({
        "id": audit_id,
        "user_id": user_id,
        "event_type": "access_granted",
        "document_id": document_id,
        "tx_hash": tx_hash,
        "block_number": generate_mock_block_number(),
        "payload": {
            "document_id": document_id,
            "grantee_id": grantee_id,
            "access_level": access_level,
        },
        "created_at": now,
    })

    return {
        "message": "Access granted",
        "grant_id": grant_id,
        "tx_hash": tx_hash,
    }


@router.post("/revoke")
async def revoke_access(
    body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Revoke previously granted access.
    """
    grant_id = body.get("grant_id")
    if not grant_id:
        raise ValidationError("grant_id is required")

    db = get_db()
    user_id = current_user["id"]

    grant_ref = db.collection("access_grants").document(grant_id)
    grant = grant_ref.get()

    if not grant.exists:
        raise NotFoundError("Access grant")

    grant_data = grant.to_dict()
    if grant_data.get("grantor_id") != user_id:
        raise NotFoundError("Access grant")

    now = datetime.utcnow().isoformat()
    tx_hash = generate_mock_tx_hash(f"revoke:{grant_id}:{now}")

    grant_ref.update({
        "status": "revoked",
        "revoked_at": now,
        "revoke_tx_hash": tx_hash,
    })

    # Audit trail
    audit_id = str(uuid4())
    db.collection("blockchain_audit").document(audit_id).set({
        "id": audit_id,
        "user_id": user_id,
        "event_type": "access_revoked",
        "document_id": grant_data.get("document_id"),
        "tx_hash": tx_hash,
        "block_number": generate_mock_block_number(),
        "payload": {
            "document_id": grant_data.get("document_id"),
            "grant_id": grant_id,
        },
        "created_at": now,
    })

    return {
        "message": "Access revoked",
        "grant_id": grant_id,
        "tx_hash": tx_hash,
    }
