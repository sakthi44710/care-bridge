"""Authentication routes with role-based access control."""
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr

from app.config import settings
from app.core.auth import get_current_user, verify_firebase_token
from app.services.firebase import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Authentication"])

# Valid roles
VALID_ROLES = {"patient", "doctor", "clinician", "doctor_pending", "clinician_pending", "admin"}
INSTANT_ROLES = {"patient"}  # Roles that don't need verification
PENDING_ROLE_MAP = {"doctor": "doctor_pending", "clinician": "clinician_pending"}
APPROVED_ROLE_MAP = {"doctor_pending": "doctor", "clinician_pending": "clinician"}


class UserProfile(BaseModel):
    """User profile response model."""
    id: str
    email: str | None
    email_verified: bool
    name: str | None = None
    picture: str | None = None
    role: str = ""
    verification_status: str = ""  # "", "pending", "approved", "rejected"
    created_at: str | None = None


class ProfileUpdate(BaseModel):
    """Profile update request model."""
    name: str | None = None
    preferences: dict | None = None
    role: str | None = None  # For initial role selection only


class RoleVerificationRequest(BaseModel):
    """Doctor/clinician verification submission."""
    medical_license_number: str
    medical_council: str
    specialty: str
    hospital_affiliation: str | None = None
    years_of_experience: int | None = None


class AdminVerifyRequest(BaseModel):
    """Admin approval/rejection of role verification."""
    action: str  # "approve" or "reject"
    reason: str | None = None


@router.get("/me", response_model=UserProfile)
async def get_current_user_profile(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get current user's profile.
    
    Returns the authenticated user's profile information.
    Also ensures user exists in Firestore.
    """
    db = get_db()
    user_id = current_user["id"]
    
    # Get or create user document in Firestore
    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()
    
    if user_doc.exists:
        user_data = user_doc.to_dict()
        # Auto-promote to admin if email is in admin list and not already admin
        user_email = (current_user.get("email") or "").lower()
        if user_email in settings.admin_emails_list and user_data.get("role") != "admin":
            user_data["role"] = "admin"
            user_data["verification_status"] = "approved"
            user_ref.update({"role": "admin", "verification_status": "approved", "updated_at": datetime.utcnow().isoformat()})
            logger.info(f"Auto-promoted user {user_id} ({user_email}) to admin")
    else:
        # Create new user document
        user_email = (current_user.get("email") or "").lower()
        is_admin = user_email in settings.admin_emails_list
        user_data = {
            "id": user_id,
            "email": current_user.get("email"),
            "email_verified": current_user.get("email_verified", False),
            "name": current_user.get("name"),
            "picture": current_user.get("picture"),
            "role": "admin" if is_admin else "",
            "verification_status": "approved" if is_admin else "",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        user_ref.set(user_data)
        logger.info(f"Created new user: {user_id}{' (admin)' if is_admin else ''}")
    
    return UserProfile(
        id=user_id,
        email=current_user.get("email"),
        email_verified=current_user.get("email_verified", False),
        name=user_data.get("name") or current_user.get("name"),
        picture=user_data.get("picture") or current_user.get("picture"),
        role=user_data.get("role", ""),
        verification_status=user_data.get("verification_status", ""),
        created_at=user_data.get("created_at"),
    )


@router.put("/me")
async def update_profile(
    updates: ProfileUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update current user's profile. Handles initial role selection."""
    db = get_db()
    user_ref = db.collection("users").document(current_user["id"])
    user_doc = user_ref.get()
    user_data = user_doc.to_dict() if user_doc.exists else {}
    
    update_data = {"updated_at": datetime.utcnow().isoformat()}
    
    if updates.name is not None:
        update_data["name"] = updates.name
    if updates.preferences is not None:
        update_data["preferences"] = updates.preferences
    
    # Handle role selection (only if no role set yet)
    if updates.role is not None:
        current_role = user_data.get("role", "")
        if current_role and current_role not in ("", "rejected"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role already set. Contact admin to change role."
            )
        
        requested_role = updates.role.lower()
        if requested_role not in {"patient", "doctor", "clinician"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role. Must be: patient, doctor, or clinician"
            )
        
        if requested_role in INSTANT_ROLES:
            # Patient role is granted instantly
            update_data["role"] = "patient"
            update_data["verification_status"] = "approved"
            logger.info(f"User {current_user['id']} selected role: patient")
        else:
            # Doctor/clinician goes to pending state
            update_data["role"] = PENDING_ROLE_MAP[requested_role]
            update_data["verification_status"] = "pending"
            logger.info(f"User {current_user['id']} selected role: {requested_role} (pending verification)")
    
    user_ref.update(update_data)
    
    return {"message": "Profile updated successfully"}


@router.post("/verify-role")
async def submit_role_verification(
    request: RoleVerificationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Submit verification data for doctor/clinician role.
    Only users with pending roles can submit verification.
    """
    db = get_db()
    user_id = current_user["id"]
    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()
    
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_data = user_doc.to_dict()
    role = user_data.get("role", "")
    
    if role not in ("doctor_pending", "clinician_pending"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only users with pending doctor/clinician role can submit verification"
        )
    
    # Store verification data
    verification_data = {
        "medical_license_number": request.medical_license_number,
        "medical_council": request.medical_council,
        "specialty": request.specialty,
        "hospital_affiliation": request.hospital_affiliation,
        "years_of_experience": request.years_of_experience,
        "submitted_at": datetime.utcnow().isoformat(),
    }
    
    user_ref.update({
        "verification_data": verification_data,
        "verification_status": "pending",
        "updated_at": datetime.utcnow().isoformat(),
    })
    
    logger.info(f"Verification submitted by user {user_id} for role {role}")
    
    return {"message": "Verification submitted successfully. Awaiting admin approval."}


@router.get("/admin/pending-verifications")
async def list_pending_verifications(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    List all users with pending role verification.
    Only accessible by admin users.
    """
    db = get_db()
    user_id = current_user["id"]
    
    # Check if current user is admin
    admin_ref = db.collection("users").document(user_id)
    admin_doc = admin_ref.get()
    if not admin_doc.exists or admin_doc.to_dict().get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Get all pending users
    pending_users = []
    
    for pending_role in ("doctor_pending", "clinician_pending"):
        query = db.collection("users").where("role", "==", pending_role)
        for doc in query.stream():
            data = doc.to_dict()
            pending_users.append({
                "id": data.get("id", doc.id),
                "email": data.get("email"),
                "name": data.get("name"),
                "role": data.get("role"),
                "verification_status": data.get("verification_status", "pending"),
                "verification_data": data.get("verification_data", {}),
                "created_at": data.get("created_at"),
            })
    
    # Sort by created_at
    pending_users.sort(key=lambda u: u.get("created_at", ""), reverse=True)
    
    return {"pending_users": pending_users, "total": len(pending_users)}


@router.put("/admin/verify/{user_id}")
async def admin_verify_user(
    user_id: str,
    request: AdminVerifyRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Approve or reject a user's role verification.
    Only accessible by admin users.
    """
    db = get_db()
    admin_id = current_user["id"]
    
    # Check if current user is admin
    admin_ref = db.collection("users").document(admin_id)
    admin_doc = admin_ref.get()
    if not admin_doc.exists or admin_doc.to_dict().get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Get target user
    target_ref = db.collection("users").document(user_id)
    target_doc = target_ref.get()
    
    if not target_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
    
    target_data = target_doc.to_dict()
    current_role = target_data.get("role", "")
    
    if current_role not in APPROVED_ROLE_MAP:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User does not have a pending role. Current role: {current_role}"
        )
    
    if request.action == "approve":
        approved_role = APPROVED_ROLE_MAP[current_role]
        target_ref.update({
            "role": approved_role,
            "verification_status": "approved",
            "verified_by": admin_id,
            "verified_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        })
        logger.info(f"Admin {admin_id} approved user {user_id} as {approved_role}")
        return {"message": f"User approved as {approved_role}", "role": approved_role}
    
    elif request.action == "reject":
        target_ref.update({
            "role": "",
            "verification_status": "rejected",
            "rejection_reason": request.reason or "Verification rejected by admin",
            "verified_by": admin_id,
            "verified_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        })
        logger.info(f"Admin {admin_id} rejected user {user_id}")
        return {"message": "User verification rejected", "role": ""}
    
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Action must be 'approve' or 'reject'"
        )





@router.post("/verify")
@router.post("/verify-token")
async def verify_token(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Verify authentication token.
    
    Used by clients to check if their token is still valid.
    """
    return {
        "valid": True,
        "user_id": current_user["id"],
        "email": current_user.get("email"),
    }


@router.delete("/me")
async def delete_account(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Delete user account and all associated data.
    
    This is a destructive operation that removes:
    - User profile
    - All documents
    - All conversations
    """
    db = get_db()
    user_id = current_user["id"]
    
    # Delete user's documents
    docs_query = db.collection("documents").where("user_id", "==", user_id)
    for doc in docs_query.stream():
        doc.reference.delete()
    
    # Delete user's conversations and messages
    convs_query = db.collection("conversations").where("user_id", "==", user_id)
    for conv in convs_query.stream():
        # Delete messages subcollection
        for msg in conv.reference.collection("messages").stream():
            msg.reference.delete()
        conv.reference.delete()
    
    # Delete user document
    db.collection("users").document(user_id).delete()
    
    logger.info(f"Deleted user account: {user_id}")
    
    return {"message": "Account deleted successfully"}
