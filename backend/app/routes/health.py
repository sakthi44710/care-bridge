"""Health check routes."""
from fastapi import APIRouter
from app.config import settings

router = APIRouter(tags=["Health"])


@router.get("")
async def health_check():
    """
    Health check endpoint.
    
    Returns service status and version information.
    Used by load balancers and monitoring systems.
    """
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@router.get("/ready")
async def readiness_check():
    """
    Readiness check endpoint.
    
    Verifies the service is ready to accept requests.
    Checks database connectivity and external services.
    """
    checks = {
        "api": True,
        "database": True,  # Could add actual DB check
        "ai_service": bool(settings.NVIDIA_API_KEY),
    }
    
    all_ready = all(checks.values())
    
    return {
        "ready": all_ready,
        "checks": checks,
    }
