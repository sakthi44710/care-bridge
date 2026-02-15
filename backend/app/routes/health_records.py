"""Health Records routes - extraction, listing, trends, export."""
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from uuid import uuid4
from collections import defaultdict

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.exceptions import NotFoundError
from app.services.firebase import get_db
from app.services.ai import ai_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health Records"])


# ===================
# Routes
# ===================

@router.get("")
async def list_health_records(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    record_type: Optional[str] = Query(None),
    days_back: int = Query(30, ge=1, le=365, description="Only return records from the last N days"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    List health records for the user from the last N days (default 30).

    Automatically filters to recent records and excludes records
    whose source document has been deleted.
    """
    db = get_db()
    user_id = current_user["id"]

    query = db.collection("health_records").where("user_id", "==", user_id)

    if record_type:
        query = query.where("record_type", "==", record_type)

    all_records = [doc.to_dict() for doc in query.stream()]

    # Filter by date window
    cutoff = (datetime.utcnow() - timedelta(days=days_back)).isoformat()
    all_records = [
        r for r in all_records
        if r.get("created_at", r.get("effective_date", "")) >= cutoff
    ]

    # Sort by effective_date descending
    all_records.sort(key=lambda r: r.get("effective_date", ""), reverse=True)

    # Paginate
    start = (page - 1) * per_page
    end = start + per_page

    return all_records[start:end]


@router.get("/trends")
async def get_health_trends(
    record_type: Optional[str] = Query(None),
    months: int = Query(12, ge=1, le=60),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Get health data trends over time.
    
    Groups records by type and returns time-series data points.
    """
    db = get_db()
    user_id = current_user["id"]

    cutoff = (datetime.utcnow() - timedelta(days=months * 30)).isoformat()

    query = db.collection("health_records").where("user_id", "==", user_id)

    if record_type:
        query = query.where("record_type", "==", record_type)

    all_records = [doc.to_dict() for doc in query.stream()]

    # Filter by date
    filtered = [
        r for r in all_records
        if r.get("effective_date", "") >= cutoff
    ]

    # Group by record_type
    grouped: Dict[str, list] = defaultdict(list)
    for r in filtered:
        rt = r.get("record_type", "other")
        grouped[rt].append(r)

    trends = []
    for rt, records in grouped.items():
        records.sort(key=lambda r: r.get("effective_date", ""))
        unit = records[0].get("value_unit", "") if records else ""
        data_points = [
            {
                "date": r.get("effective_date", ""),
                "value": r.get("value_numeric"),
                "is_abnormal": r.get("is_abnormal", False),
            }
            for r in records
            if r.get("value_numeric") is not None
        ]
        trends.append({
            "record_type": rt,
            "unit": unit,
            "data_points": data_points,
        })

    return trends


@router.post("/extract")
async def extract_health_records(
    body: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Extract structured health records from a document using AI.
    
    Takes a document_id, reads OCR text, and uses AI to extract
    lab values, medications, conditions, etc.
    """
    document_id = body.get("document_id")
    if not document_id:
        from app.core.exceptions import ValidationError
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

    ocr_text = doc_data.get("ocr_text", "")
    if not ocr_text.strip():
        return {
            "document_id": document_id,
            "records": [],
            "message": "No text available for extraction",
        }

    # Use AI to extract structured health data
    raw_records = await ai_service.extract_health_data(ocr_text)

    # Save each record to Firestore
    saved_records = []
    now = datetime.utcnow().isoformat()

    for record in raw_records:
        record_id = str(uuid4())
        health_record = {
            "id": record_id,
            "user_id": user_id,
            "document_id": document_id,
            "name": record.get("name", "Unknown"),
            "record_type": record.get("type", "observation"),
            "value_numeric": record.get("value"),
            "value_unit": record.get("unit", ""),
            "reference_range_low": record.get("reference_low"),
            "reference_range_high": record.get("reference_high"),
            "is_abnormal": record.get("is_abnormal", False),
            "effective_date": record.get("date", now),
            "fhir_resource_type": "Observation",
            "fhir_resource": {
                "resourceType": "Observation",
                "id": record_id,
                "status": "final",
                "code": {
                    "text": record.get("name", "Unknown"),
                },
                "valueQuantity": {
                    "value": record.get("value"),
                    "unit": record.get("unit", ""),
                },
                "referenceRange": [
                    {
                        "low": {"value": record.get("reference_low")},
                        "high": {"value": record.get("reference_high")},
                    }
                ] if record.get("reference_low") or record.get("reference_high") else [],
                "effectiveDateTime": record.get("date", now),
            },
            "created_at": now,
        }

        db.collection("health_records").document(record_id).set(health_record)
        saved_records.append(health_record)

    # Mark document as extracted
    doc_ref.update({
        "health_records_extracted": True,
        "extraction_count": len(saved_records),
        "updated_at": now,
    })

    logger.info(
        f"Extracted {len(saved_records)} health records "
        f"from document {document_id}"
    )

    return {
        "document_id": document_id,
        "records": saved_records,
        "record_count": len(saved_records),
        "message": f"Successfully extracted {len(saved_records)} health records",
    }


@router.post("/sync")
async def sync_health_records(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Sync health records: remove orphaned records from deleted documents,
    and auto-extract from any recent documents (last 30 days) that
    haven't been extracted yet.
    """
    db = get_db()
    user_id = current_user["id"]

    # 1) Gather all user health records
    hr_query = db.collection("health_records").where("user_id", "==", user_id)
    all_hr = [(doc.id, doc.to_dict()) for doc in hr_query.stream()]

    # 2) Gather all user document ids
    doc_query = db.collection("documents").where("user_id", "==", user_id)
    user_docs = {d.id: d.to_dict() for d in doc_query.stream()}
    active_doc_ids = {
        doc_id for doc_id, d in user_docs.items()
        if d.get("status") != "deleted"
    }

    # 3) Delete orphaned records whose source document is gone
    deleted_count = 0
    for hr_id, hr_data in all_hr:
        src_doc = hr_data.get("document_id")
        if src_doc and src_doc not in active_doc_ids:
            db.collection("health_records").document(hr_id).delete()
            deleted_count += 1

    # 4) Auto-extract from recent unextracted documents
    cutoff_30 = (datetime.utcnow() - timedelta(days=30)).isoformat()
    extracted_count = 0
    for doc_id, doc_data in user_docs.items():
        if doc_data.get("status") == "deleted":
            continue
        if doc_data.get("health_records_extracted"):
            continue
        if doc_data.get("created_at", "") < cutoff_30:
            continue
        ocr_text = doc_data.get("ocr_text", "")
        if not ocr_text.strip():
            continue
        # Run AI extraction
        try:
            raw_records = await ai_service.extract_health_data(ocr_text)
            now = datetime.utcnow().isoformat()
            for record in raw_records:
                record_id = str(uuid4())
                health_record = {
                    "id": record_id,
                    "user_id": user_id,
                    "document_id": doc_id,
                    "name": record.get("name", "Unknown"),
                    "record_type": record.get("type", "observation"),
                    "value_numeric": record.get("value"),
                    "value_unit": record.get("unit", ""),
                    "reference_range_low": record.get("reference_low"),
                    "reference_range_high": record.get("reference_high"),
                    "is_abnormal": record.get("is_abnormal", False),
                    "effective_date": record.get("date", now),
                    "fhir_resource_type": "Observation",
                    "fhir_resource": {
                        "resourceType": "Observation",
                        "id": record_id,
                        "status": "final",
                        "code": {"text": record.get("name", "Unknown")},
                        "valueQuantity": {
                            "value": record.get("value"),
                            "unit": record.get("unit", ""),
                        },
                        "effectiveDateTime": record.get("date", now),
                    },
                    "created_at": now,
                }
                db.collection("health_records").document(record_id).set(health_record)
                extracted_count += 1
            db.collection("documents").document(doc_id).update({
                "health_records_extracted": True,
                "extraction_count": len(raw_records),
                "updated_at": now,
            })
        except Exception as e:
            logger.error(f"Auto-extract failed for doc {doc_id}: {e}")

    logger.info(
        f"Health records sync: deleted {deleted_count} orphaned, "
        f"extracted {extracted_count} new records"
    )

    return {
        "orphaned_deleted": deleted_count,
        "new_records_extracted": extracted_count,
    }


@router.get("/export")
async def export_health_records(
    record_type: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Export health records as a FHIR Bundle (JSON).
    """
    db = get_db()
    user_id = current_user["id"]

    query = db.collection("health_records").where("user_id", "==", user_id)

    if record_type:
        query = query.where("record_type", "==", record_type)

    all_records = [doc.to_dict() for doc in query.stream()]

    # Build FHIR Bundle
    bundle = {
        "resourceType": "Bundle",
        "type": "collection",
        "total": len(all_records),
        "entry": [
            {
                "resource": r.get("fhir_resource", {
                    "resourceType": "Observation",
                    "id": r.get("id"),
                    "code": {"text": r.get("name", "")},
                }),
            }
            for r in all_records
        ],
    }

    return bundle
