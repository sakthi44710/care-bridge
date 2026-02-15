"""API routes module."""
from fastapi import APIRouter

from app.routes.health import router as health_router
from app.routes.auth import router as auth_router
from app.routes.documents import router as documents_router
from app.routes.chat import router as chat_router
from app.routes.health_records import router as health_records_router
from app.routes.blockchain import router as blockchain_router
from app.routes.doctor_patient import router as doctor_patient_router

# Combined router
router = APIRouter()
router.include_router(health_router, prefix="/health")
router.include_router(auth_router, prefix="/auth")
router.include_router(documents_router, prefix="/documents")
router.include_router(chat_router, prefix="/chat")
router.include_router(health_records_router, prefix="/health-records")
router.include_router(blockchain_router, prefix="/blockchain")
router.include_router(doctor_patient_router, prefix="/care")

__all__ = [
    "router",
    "health_router",
    "auth_router", 
    "documents_router",
    "chat_router",
    "health_records_router",
    "blockchain_router",
    "doctor_patient_router",
]
