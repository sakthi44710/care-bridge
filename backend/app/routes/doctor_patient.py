"""Doctor-Patient relationships and consultation management routes."""
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.services.firebase import get_db
from app.services.storage import get_download_url

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Doctor-Patient"])


# ===================
# Models
# ===================

class AppointmentRequest(BaseModel):
    """Patient sends an appointment/consultation request to a doctor by ID."""
    doctor_id: str
    message: str = ""


class RequestAction(BaseModel):
    """Accept or reject a pending request."""
    action: str  # 'accept' or 'reject'


class ConsultationRequest(BaseModel):
    """Patient requests a document consultation (after link is active)."""
    doctor_id: str
    document_ids: List[str]
    message: str = ""
    consultation_type: str = "document_review"


class ConsultationPayment(BaseModel):
    """Payment confirmation for consultation."""
    payment_method: str = "online"
    transaction_id: str = ""


class ConsultationResponse(BaseModel):
    """Doctor responds to consultation."""
    response_text: str


# ===================
# Helpers
# ===================
async def verify_admin(user_id: str):
    db = get_db()
    user_doc = db.collection("users").document(user_id).get()
    if not user_doc.exists or user_doc.to_dict().get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


async def verify_doctor(user_id: str):
    db = get_db()
    user_doc = db.collection("users").document(user_id).get()
    if not user_doc.exists or user_doc.to_dict().get("role") not in ("doctor", "clinician"):
        raise HTTPException(status_code=403, detail="Doctor/clinician access required")
    return user_doc.to_dict()


# ===================
# Admin: Doctors by Hospital
# ===================

@router.get("/admin/doctors")
async def list_doctors_by_hospital(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """List all verified doctors grouped by hospital. Admin only."""
    await verify_admin(current_user["id"])
    db = get_db()

    doctors = []
    for role in ("doctor", "clinician"):
        query = db.collection("users").where("role", "==", role)
        for doc in query.stream():
            data = doc.to_dict()
            vd = data.get("verification_data", {})
            doctors.append({
                "id": data.get("id", doc.id),
                "email": data.get("email"),
                "name": data.get("name"),
                "role": data.get("role"),
                "specialty": vd.get("specialty", ""),
                "hospital": vd.get("hospital_affiliation", "Unaffiliated"),
                "medical_license": vd.get("medical_license_number", ""),
                "years_of_experience": vd.get("years_of_experience"),
                "verified_at": data.get("verified_at", ""),
            })

    # Group by hospital
    hospitals: Dict[str, list] = {}
    for doc in doctors:
        h = doc["hospital"] or "Unaffiliated"
        hospitals.setdefault(h, []).append(doc)

    grouped = []
    for h_name in sorted(hospitals.keys()):
        h_docs = sorted(hospitals[h_name], key=lambda d: d.get("name") or "")
        grouped.append({"hospital": h_name, "doctors": h_docs, "count": len(h_docs)})

    return {"hospitals": grouped, "total_doctors": len(doctors)}


# ===================
# Patient: Browse Available Doctors
# ===================

@router.get("/patient/available-doctors")
async def list_available_doctors(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Patient can browse all verified doctors with their department/specialty."""
    db = get_db()

    doctors = []
    for role in ("doctor", "clinician"):
        query = db.collection("users").where("role", "==", role)
        for doc in query.stream():
            data = doc.to_dict()
            vd = data.get("verification_data", {})
            doctors.append({
                "id": data.get("id", doc.id),
                "name": data.get("name", ""),
                "email": data.get("email", ""),
                "specialty": vd.get("specialty", ""),
                "department": vd.get("specialty", ""),
                "hospital": vd.get("hospital_affiliation", ""),
                "years_of_experience": vd.get("years_of_experience"),
            })

    # Sort by hospital then name
    doctors.sort(key=lambda d: (d.get("hospital") or "", d.get("name") or ""))
    return {"doctors": doctors, "total": len(doctors)}


# ===================
# Patient: Send Appointment Request to a Doctor
# ===================

@router.post("/patient/request-appointment")
async def request_appointment(
    request: AppointmentRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Patient sends an appointment/consultation request to a doctor by ID."""
    patient_id = current_user["id"]
    db = get_db()

    # Find doctor by ID
    doctor_ref = db.collection("users").document(request.doctor_id).get()
    if not doctor_ref.exists:
        raise HTTPException(status_code=404, detail="Doctor not found")

    doctor_data = doctor_ref.to_dict()
    if doctor_data.get("role") not in ("doctor", "clinician"):
        raise HTTPException(status_code=400, detail="Selected user is not a doctor")

    doctor_id = doctor_data.get("id", doctor_ref.id)

    if doctor_id == patient_id:
        raise HTTPException(status_code=400, detail="Cannot request appointment with yourself")

    # Check existing active/pending link
    existing = db.collection("doctor_patients") \
        .where("doctor_id", "==", doctor_id) \
        .where("patient_id", "==", patient_id) \
        .where("status", "in", ["active", "pending_appointment"]) \
        .stream()
    if any(True for _ in existing):
        raise HTTPException(status_code=400, detail="You already have a pending or active connection with this doctor")

    # Create pending appointment request
    link_id = str(uuid4())
    vd = doctor_data.get("verification_data", {})
    link_data = {
        "id": link_id,
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "patient_email": current_user.get("email", ""),
        "patient_name": current_user.get("name", ""),
        "doctor_name": doctor_data.get("name", ""),
        "doctor_email": doctor_data.get("email", ""),
        "doctor_specialty": vd.get("specialty", ""),
        "doctor_hospital": vd.get("hospital_affiliation", ""),
        "message": request.message,
        "status": "pending_appointment",
        "document_access": "none",
        "created_at": datetime.utcnow().isoformat(),
    }
    db.collection("doctor_patients").document(link_id).set(link_data)
    logger.info(f"Patient {patient_id} sent appointment request to doctor {doctor_id}")

    return {"message": "Appointment request sent to doctor. Awaiting acceptance.", "link_id": link_id, "status": "pending_appointment"}


# ===================
# Doctor: View & Respond to Appointment Requests
# ===================

@router.get("/doctor/appointment-requests")
async def list_appointment_requests(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Doctor views incoming appointment requests from patients."""
    doctor_id = current_user["id"]
    await verify_doctor(doctor_id)
    db = get_db()

    links = db.collection("doctor_patients") \
        .where("doctor_id", "==", doctor_id) \
        .where("status", "==", "pending_appointment") \
        .stream()

    requests = []
    for link in links:
        ld = link.to_dict()
        requests.append({
            "link_id": ld["id"],
            "patient_id": ld["patient_id"],
            "patient_name": ld.get("patient_name", ""),
            "patient_email": ld.get("patient_email", ""),
            "message": ld.get("message", ""),
            "requested_at": ld.get("created_at", ""),
        })

    return {"requests": requests, "total": len(requests)}


@router.put("/doctor/appointment-requests/{link_id}")
async def respond_appointment_request(
    link_id: str,
    action: RequestAction,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Doctor accepts or rejects a patient's appointment request."""
    doctor_id = current_user["id"]
    await verify_doctor(doctor_id)
    db = get_db()

    link_ref = db.collection("doctor_patients").document(link_id)
    link_doc = link_ref.get()
    if not link_doc.exists:
        raise HTTPException(status_code=404, detail="Request not found")

    ld = link_doc.to_dict()
    if ld.get("doctor_id") != doctor_id:
        raise HTTPException(status_code=403, detail="Not your request")
    if ld.get("status") != "pending_appointment":
        raise HTTPException(status_code=400, detail="Request already processed")

    now = datetime.utcnow().isoformat()
    if action.action == "accept":
        link_ref.update({"status": "active", "accepted_at": now, "document_access": "none"})
        logger.info(f"Doctor {doctor_id} accepted appointment from patient {ld['patient_id']}")
        return {"message": "Appointment accepted. Patient is now in your list.", "status": "active"}
    elif action.action == "reject":
        link_ref.update({"status": "rejected", "rejected_at": now})
        logger.info(f"Doctor {doctor_id} rejected appointment from patient {ld['patient_id']}")
        return {"message": "Appointment request rejected.", "status": "rejected"}
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'accept' or 'reject'.")


# ===================
# Doctor: Manage Patients & Request Document Access
# ===================

@router.get("/doctor/patients")
async def list_my_patients(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Doctor views their patient list (active links)."""
    doctor_id = current_user["id"]
    await verify_doctor(doctor_id)
    db = get_db()

    links = db.collection("doctor_patients") \
        .where("doctor_id", "==", doctor_id) \
        .where("status", "==", "active") \
        .stream()

    patients = []
    for link in links:
        ld = link.to_dict()
        p_doc = db.collection("users").document(ld["patient_id"]).get()
        p_data = p_doc.to_dict() if p_doc.exists else {}
        patients.append({
            "link_id": ld["id"],
            "patient_id": ld["patient_id"],
            "name": p_data.get("name") or ld.get("patient_name", ""),
            "email": p_data.get("email") or ld.get("patient_email", ""),
            "document_access": ld.get("document_access", "none"),
            "linked_since": ld.get("accepted_at") or ld.get("created_at", ""),
        })

    return {"patients": patients, "total": len(patients)}


@router.post("/doctor/patients/{link_id}/request-documents")
async def request_document_access(
    link_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Doctor requests document access from a linked patient."""
    doctor_id = current_user["id"]
    await verify_doctor(doctor_id)
    db = get_db()

    link_ref = db.collection("doctor_patients").document(link_id)
    link_doc = link_ref.get()
    if not link_doc.exists:
        raise HTTPException(status_code=404, detail="Link not found")

    ld = link_doc.to_dict()
    if ld.get("doctor_id") != doctor_id:
        raise HTTPException(status_code=403, detail="Not your patient link")
    if ld.get("status") != "active":
        raise HTTPException(status_code=400, detail="Link is not active")
    if ld.get("document_access") == "granted":
        raise HTTPException(status_code=400, detail="Document access already granted")
    if ld.get("document_access") == "requested":
        raise HTTPException(status_code=400, detail="Document access already requested")

    link_ref.update({
        "document_access": "requested",
        "document_access_requested_at": datetime.utcnow().isoformat(),
    })
    logger.info(f"Doctor {doctor_id} requested document access for link {link_id}")

    return {"message": "Document access request sent to patient.", "document_access": "requested"}


@router.delete("/doctor/patients/{link_id}")
async def unlink_patient(
    link_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Doctor removes a patient from their care list."""
    doctor_id = current_user["id"]
    await verify_doctor(doctor_id)
    db = get_db()

    link_ref = db.collection("doctor_patients").document(link_id)
    link_doc = link_ref.get()
    if not link_doc.exists or link_doc.to_dict().get("doctor_id") != doctor_id:
        raise HTTPException(status_code=404, detail="Link not found")

    link_ref.update({"status": "removed", "removed_at": datetime.utcnow().isoformat()})
    return {"message": "Patient unlinked"}


@router.get("/doctor/patients/{patient_id}/documents")
async def get_patient_documents(
    patient_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Doctor views documents of a linked patient (only if document_access == granted)."""
    doctor_id = current_user["id"]
    await verify_doctor(doctor_id)
    db = get_db()

    # Verify active link WITH granted document access
    links = db.collection("doctor_patients") \
        .where("doctor_id", "==", doctor_id) \
        .where("patient_id", "==", patient_id) \
        .where("status", "==", "active") \
        .stream()

    link_found = None
    for l in links:
        link_found = l.to_dict()
        break

    if not link_found:
        raise HTTPException(status_code=403, detail="This patient is not in your care list")
    if link_found.get("document_access") != "granted":
        raise HTTPException(status_code=403, detail="Document access not granted by patient")

    docs = db.collection("documents") \
        .where("user_id", "==", patient_id) \
        .stream()

    documents = []
    for d in docs:
        dd = d.to_dict()
        if dd.get("status") == "deleted":
            continue
        download_url = None
        storage_path = dd.get("storage_path")
        if storage_path:
            try:
                download_url = get_download_url(storage_path, expiration_minutes=60)
            except Exception:
                pass
        documents.append({
            "id": dd.get("id", d.id),
            "filename": dd.get("filename"),
            "document_type": dd.get("document_type"),
            "mime_type": dd.get("mime_type"),
            "file_size": dd.get("file_size"),
            "download_url": download_url,
            "status": dd.get("status"),
            "created_at": dd.get("created_at"),
        })

    documents.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"documents": documents, "total": len(documents), "patient_id": patient_id}


@router.get("/doctor/patients/{patient_id}/documents/{document_id}")
async def get_patient_document_detail(
    patient_id: str,
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Doctor views document details (only if document_access == granted)."""
    doctor_id = current_user["id"]
    await verify_doctor(doctor_id)
    db = get_db()

    links = db.collection("doctor_patients") \
        .where("doctor_id", "==", doctor_id) \
        .where("patient_id", "==", patient_id) \
        .where("status", "==", "active") \
        .stream()

    link_found = None
    for l in links:
        link_found = l.to_dict()
        break

    if not link_found:
        raise HTTPException(status_code=403, detail="This patient is not in your care list")
    if link_found.get("document_access") != "granted":
        raise HTTPException(status_code=403, detail="Document access not granted by patient")

    doc_ref = db.collection("documents").document(document_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Document not found")
    dd = doc.to_dict()
    if dd.get("user_id") != patient_id:
        raise HTTPException(status_code=403, detail="Document does not belong to this patient")

    download_url = None
    storage_path = dd.get("storage_path")
    if storage_path:
        try:
            download_url = get_download_url(storage_path, expiration_minutes=60)
        except Exception:
            pass

    return {
        "id": dd.get("id", doc.id),
        "filename": dd.get("filename"),
        "document_type": dd.get("document_type"),
        "mime_type": dd.get("mime_type"),
        "file_size": dd.get("file_size"),
        "download_url": download_url,
        "status": dd.get("status"),
        "created_at": dd.get("created_at"),
    }


# ===================
# Patient: My Doctors, Document Access Requests
# ===================

@router.get("/patient/doctors")
async def list_my_doctors(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Patient views the list of doctors they have active connections with."""
    patient_id = current_user["id"]
    db = get_db()

    links = db.collection("doctor_patients") \
        .where("patient_id", "==", patient_id) \
        .where("status", "==", "active") \
        .stream()

    doctors = []
    for link in links:
        ld = link.to_dict()
        d_doc = db.collection("users").document(ld["doctor_id"]).get()
        d_data = d_doc.to_dict() if d_doc.exists else {}
        vd = d_data.get("verification_data", {})
        doctors.append({
            "link_id": ld["id"],
            "doctor_id": ld["doctor_id"],
            "name": d_data.get("name") or ld.get("doctor_name", ""),
            "email": d_data.get("email") or ld.get("doctor_email", ""),
            "specialty": vd.get("specialty", "") or ld.get("doctor_specialty", ""),
            "hospital": vd.get("hospital_affiliation", "") or ld.get("doctor_hospital", ""),
            "document_access": ld.get("document_access", "none"),
            "linked_since": ld.get("accepted_at") or ld.get("created_at", ""),
        })

    return {"doctors": doctors, "total": len(doctors)}


@router.get("/patient/appointment-status")
async def list_my_appointment_requests(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Patient views their own pending appointment requests."""
    patient_id = current_user["id"]
    db = get_db()

    links = db.collection("doctor_patients") \
        .where("patient_id", "==", patient_id) \
        .where("status", "==", "pending_appointment") \
        .stream()

    requests = []
    for link in links:
        ld = link.to_dict()
        requests.append({
            "link_id": ld["id"],
            "doctor_id": ld["doctor_id"],
            "doctor_name": ld.get("doctor_name", ""),
            "doctor_email": ld.get("doctor_email", ""),
            "doctor_specialty": ld.get("doctor_specialty", ""),
            "doctor_hospital": ld.get("doctor_hospital", ""),
            "message": ld.get("message", ""),
            "requested_at": ld.get("created_at", ""),
        })

    return {"requests": requests, "total": len(requests)}


@router.get("/patient/document-requests")
async def list_document_access_requests(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Patient views pending document access requests from doctors."""
    patient_id = current_user["id"]
    db = get_db()

    links = db.collection("doctor_patients") \
        .where("patient_id", "==", patient_id) \
        .where("status", "==", "active") \
        .where("document_access", "==", "requested") \
        .stream()

    requests = []
    for link in links:
        ld = link.to_dict()
        requests.append({
            "link_id": ld["id"],
            "doctor_id": ld["doctor_id"],
            "doctor_name": ld.get("doctor_name", ""),
            "doctor_email": ld.get("doctor_email", ""),
            "doctor_specialty": ld.get("doctor_specialty", ""),
            "doctor_hospital": ld.get("doctor_hospital", ""),
            "requested_at": ld.get("document_access_requested_at", ""),
        })

    return {"requests": requests, "total": len(requests)}


@router.put("/patient/document-requests/{link_id}")
async def respond_document_access(
    link_id: str,
    action: RequestAction,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Patient accepts or rejects a doctor's document access request."""
    patient_id = current_user["id"]
    db = get_db()

    link_ref = db.collection("doctor_patients").document(link_id)
    link_doc = link_ref.get()
    if not link_doc.exists:
        raise HTTPException(status_code=404, detail="Request not found")

    ld = link_doc.to_dict()
    if ld.get("patient_id") != patient_id:
        raise HTTPException(status_code=403, detail="Not your request")
    if ld.get("document_access") != "requested":
        raise HTTPException(status_code=400, detail="No pending document access request")

    now = datetime.utcnow().isoformat()
    if action.action == "accept":
        link_ref.update({"document_access": "granted", "document_access_granted_at": now})
        logger.info(f"Patient {patient_id} granted document access to doctor {ld['doctor_id']}")
        return {"message": "Document access granted. Doctor can now view your documents.", "document_access": "granted"}
    elif action.action == "reject":
        link_ref.update({"document_access": "denied", "document_access_denied_at": now})
        logger.info(f"Patient {patient_id} denied document access to doctor {ld['doctor_id']}")
        return {"message": "Document access denied.", "document_access": "denied"}
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'accept' or 'reject'.")


# ===================
# Consultations
# ===================

@router.post("/consultations")
async def request_consultation(
    request: ConsultationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Patient requests a document review consultation with a doctor."""
    patient_id = current_user["id"]
    db = get_db()

    # Verify the doctor exists and is active
    doctor_ref = db.collection("users").document(request.doctor_id)
    doctor_doc = doctor_ref.get()
    if not doctor_doc.exists or doctor_doc.to_dict().get("role") not in ("doctor", "clinician"):
        raise HTTPException(status_code=404, detail="Doctor not found")

    doctor_data = doctor_doc.to_dict()

    # Verify doctor-patient relationship exists (active)
    links = db.collection("doctor_patients") \
        .where("doctor_id", "==", request.doctor_id) \
        .where("patient_id", "==", patient_id) \
        .where("status", "==", "active") \
        .stream()
    if not any(True for _ in links):
        raise HTTPException(status_code=403, detail="You must have an active appointment with this doctor first.")

    # Verify documents belong to the patient
    for doc_id in request.document_ids:
        doc = db.collection("documents").document(doc_id).get()
        if not doc.exists or doc.to_dict().get("user_id") != patient_id:
            raise HTTPException(status_code=400, detail=f"Document {doc_id} not found or not yours")

    # Create consultation
    consultation_id = str(uuid4())
    now = datetime.utcnow().isoformat()

    consultation_data = {
        "id": consultation_id,
        "patient_id": patient_id,
        "patient_name": current_user.get("name", ""),
        "patient_email": current_user.get("email", ""),
        "doctor_id": request.doctor_id,
        "doctor_name": doctor_data.get("name", ""),
        "doctor_email": doctor_data.get("email", ""),
        "document_ids": request.document_ids,
        "message": request.message,
        "consultation_type": "document_review",
        "status": "pending_payment",  # pending_payment -> paid -> in_review -> completed
        "payment_status": "unpaid",
        "payment_amount": 500,  # Default consultation fee in INR
        "payment_data": {},
        "doctor_response": "",
        "created_at": now,
        "updated_at": now,
    }

    db.collection("consultations").document(consultation_id).set(consultation_data)
    logger.info(f"Consultation {consultation_id} created by patient {patient_id} for doctor {request.doctor_id}")

    return {
        "message": "Consultation request created. Complete payment to proceed.",
        "consultation_id": consultation_id,
        "payment_amount": 500,
        "status": "pending_payment",
    }


@router.post("/consultations/{consultation_id}/pay")
async def pay_consultation(
    consultation_id: str,
    payment: ConsultationPayment,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Patient pays for a consultation (MVP: simple confirmation)."""
    patient_id = current_user["id"]
    db = get_db()

    cons_ref = db.collection("consultations").document(consultation_id)
    cons_doc = cons_ref.get()
    if not cons_doc.exists:
        raise HTTPException(status_code=404, detail="Consultation not found")

    cons_data = cons_doc.to_dict()
    if cons_data.get("patient_id") != patient_id:
        raise HTTPException(status_code=403, detail="Not your consultation")
    if cons_data.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Already paid")

    # MVP: Mark as paid (in production, integrate with Razorpay/Stripe)
    cons_ref.update({
        "payment_status": "paid",
        "status": "in_review",
        "payment_data": {
            "method": payment.payment_method,
            "transaction_id": payment.transaction_id or f"TXN_{uuid4().hex[:12].upper()}",
            "paid_at": datetime.utcnow().isoformat(),
        },
        "updated_at": datetime.utcnow().isoformat(),
    })

    logger.info(f"Consultation {consultation_id} paid by patient {patient_id}")
    return {"message": "Payment successful. Doctor will review your documents.", "status": "in_review"}


@router.get("/consultations")
async def list_consultations(
    role_filter: Optional[str] = Query(None, description="'patient' or 'doctor'"),
    status_filter: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """List consultations for current user (works for both patient and doctor)."""
    user_id = current_user["id"]
    db = get_db()

    # Determine user role
    user_doc = db.collection("users").document(user_id).get()
    user_role = user_doc.to_dict().get("role", "patient") if user_doc.exists else "patient"

    # Query based on role
    if user_role in ("doctor", "clinician"):
        query = db.collection("consultations").where("doctor_id", "==", user_id)
    else:
        query = db.collection("consultations").where("patient_id", "==", user_id)

    if status_filter:
        query = query.where("status", "==", status_filter)

    consultations = []
    for doc in query.stream():
        cd = doc.to_dict()
        consultations.append({
            "id": cd["id"],
            "patient_name": cd.get("patient_name", ""),
            "patient_email": cd.get("patient_email", ""),
            "doctor_name": cd.get("doctor_name", ""),
            "doctor_email": cd.get("doctor_email", ""),
            "document_ids": cd.get("document_ids", []),
            "message": cd.get("message", ""),
            "status": cd.get("status"),
            "payment_status": cd.get("payment_status"),
            "payment_amount": cd.get("payment_amount"),
            "doctor_response": cd.get("doctor_response", ""),
            "created_at": cd.get("created_at"),
            "updated_at": cd.get("updated_at"),
        })

    consultations.sort(key=lambda c: c.get("created_at", ""), reverse=True)
    return {"consultations": consultations, "total": len(consultations)}


@router.get("/consultations/{consultation_id}")
async def get_consultation(
    consultation_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get consultation details with document content (for paid consultations)."""
    user_id = current_user["id"]
    db = get_db()

    cons_ref = db.collection("consultations").document(consultation_id)
    cons_doc = cons_ref.get()
    if not cons_doc.exists:
        raise HTTPException(status_code=404, detail="Consultation not found")

    cd = cons_doc.to_dict()
    if cd.get("patient_id") != user_id and cd.get("doctor_id") != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Include documents with download URLs if paid
    documents = []
    if cd.get("payment_status") == "paid":
        for doc_id in cd.get("document_ids", []):
            doc = db.collection("documents").document(doc_id).get()
            if doc.exists:
                dd = doc.to_dict()
                download_url = None
                storage_path = dd.get("storage_path")
                if storage_path:
                    try:
                        download_url = get_download_url(storage_path, expiration_minutes=60)
                    except Exception:
                        pass
                documents.append({
                    "id": dd.get("id", doc.id),
                    "filename": dd.get("filename"),
                    "document_type": dd.get("document_type"),
                    "mime_type": dd.get("mime_type"),
                    "download_url": download_url,
                    "created_at": dd.get("created_at"),
                })

    return {
        "id": cd["id"],
        "patient_id": cd.get("patient_id"),
        "patient_name": cd.get("patient_name"),
        "patient_email": cd.get("patient_email"),
        "doctor_id": cd.get("doctor_id"),
        "doctor_name": cd.get("doctor_name"),
        "doctor_email": cd.get("doctor_email"),
        "document_ids": cd.get("document_ids", []),
        "documents": documents,
        "message": cd.get("message", ""),
        "consultation_type": cd.get("consultation_type"),
        "status": cd.get("status"),
        "payment_status": cd.get("payment_status"),
        "payment_amount": cd.get("payment_amount"),
        "payment_data": cd.get("payment_data", {}),
        "doctor_response": cd.get("doctor_response", ""),
        "created_at": cd.get("created_at"),
        "updated_at": cd.get("updated_at"),
    }


@router.put("/consultations/{consultation_id}/respond")
async def doctor_respond(
    consultation_id: str,
    request: ConsultationResponse,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Doctor submits a response to a consultation."""
    doctor_id = current_user["id"]
    await verify_doctor(doctor_id)
    db = get_db()

    cons_ref = db.collection("consultations").document(consultation_id)
    cons_doc = cons_ref.get()
    if not cons_doc.exists:
        raise HTTPException(status_code=404, detail="Consultation not found")

    cd = cons_doc.to_dict()
    if cd.get("doctor_id") != doctor_id:
        raise HTTPException(status_code=403, detail="Not your consultation")
    if cd.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Consultation not paid yet")

    cons_ref.update({
        "doctor_response": request.response_text,
        "status": "completed",
        "completed_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    })

    logger.info(f"Doctor {doctor_id} responded to consultation {consultation_id}")
    return {"message": "Response submitted successfully", "status": "completed"}
