"""
CareBridge Backend - Healthcare Document Intelligence API

A robust, secure, and high-performance API for medical document
processing with AI-powered analysis using NVIDIA's Llama 3.1.

Version: 2.0.0
"""
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.core.exceptions import (
    CareBridgeException,
    AuthenticationError,
    NotFoundError,
    ValidationError,
    RateLimitError,
    AIServiceError,
)
from app.middleware.security import SecurityHeadersMiddleware, RateLimitMiddleware
from app.routes import router as api_router
from app.services.firebase import initialize_firebase

# ===================
# Logging Setup
# ===================

def setup_logging():
    """Configure logging with appropriate format and level."""
    log_level = logging.DEBUG if settings.DEBUG else logging.INFO
    
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )
    
    # Reduce noisy loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("google.auth").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


setup_logging()
logger = logging.getLogger(__name__)


# ===================
# Lifespan Events
# ===================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Startup
    logger.info("=" * 60)
    logger.info("CareBridge Backend v2.0.0 Starting...")
    logger.info("=" * 60)
    
    # Initialize Firebase
    try:
        initialize_firebase()
        logger.info("[OK] Firebase initialized")
    except Exception as e:
        logger.error(f"[FAIL] Firebase initialization failed: {e}")
        raise
    
    # Ensure uploads directory exists
    uploads_path = Path(settings.UPLOAD_DIR)
    uploads_path.mkdir(parents=True, exist_ok=True)
    logger.info(f"[OK] Upload directory: {uploads_path.absolute()}")
    
    # Log configuration
    logger.info(f"[CONFIG] Debug Mode: {settings.DEBUG}")
    logger.info(f"[CONFIG] NVIDIA Model: {settings.NVIDIA_MODEL}")
    logger.info(f"[CONFIG] Vision Model: {settings.NVIDIA_VISION_MODEL}")
    logger.info(f"[CONFIG] Rate Limit: {settings.RATE_LIMIT_REQUESTS}/min")
    logger.info(f"[CONFIG] CORS Origins: {len(settings.CORS_ORIGINS)} configured")
    
    logger.info("=" * 60)
    logger.info("CareBridge Backend Ready!")
    logger.info("=" * 60)
    
    yield
    
    # Shutdown
    logger.info("CareBridge Backend shutting down...")


# ===================
# FastAPI Application
# ===================

app = FastAPI(
    title="CareBridge API",
    description=(
        "Healthcare Document Intelligence API\n\n"
        "**Features:**\n"
        "- 📄 Medical document upload with OCR extraction\n"
        "- 🤖 AI-powered document analysis using NVIDIA Llama 3.1\n"
        "- 💬 Document-aware chat with medical expertise routing\n"
        "- 🔐 Firebase authentication and secure storage\n\n"
        f"**Disclaimer:** {settings.MEDICAL_DISCLAIMER[:200]}..."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


# ===================
# Exception Handlers
# ===================

@app.exception_handler(CareBridgeException)
async def carebridge_exception_handler(request: Request, exc: CareBridgeException):
    """Handle custom CareBridge exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.message,
            "details": exc.details,
        },
    )


@app.exception_handler(AuthenticationError)
async def authentication_error_handler(request: Request, exc: AuthenticationError):
    """Handle authentication errors."""
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={
            "error": "authentication_error",
            "message": str(exc),
        },
        headers={"WWW-Authenticate": "Bearer"},
    )


@app.exception_handler(NotFoundError)
async def not_found_error_handler(request: Request, exc: NotFoundError):
    """Handle not found errors."""
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={
            "error": "not_found",
            "message": str(exc),
        },
    )


@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError):
    """Handle validation errors."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "validation_error",
            "message": str(exc),
        },
    )


@app.exception_handler(RateLimitError)
async def rate_limit_error_handler(request: Request, exc: RateLimitError):
    """Handle rate limit errors."""
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "error": "rate_limit_exceeded",
            "message": str(exc),
        },
        headers={"Retry-After": "60"},
    )


@app.exception_handler(AIServiceError)
async def ai_service_error_handler(request: Request, exc: AIServiceError):
    """Handle AI service errors."""
    logger.error(f"AI Service Error: {exc}")
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "error": "ai_service_error",
            "message": "AI service is temporarily unavailable. Please try again.",
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions."""
    logger.exception(f"Unhandled exception: {exc}")
    
    if settings.DEBUG:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "internal_error",
                "message": str(exc),
                "type": type(exc).__name__,
            },
        )
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "internal_error",
            "message": "An unexpected error occurred. Please try again.",
        },
    )


# ===================
# Middleware
# ===================

# Security headers (should be first)
app.add_middleware(SecurityHeadersMiddleware)

# Rate limiting
app.add_middleware(RateLimitMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Process-Time"],
)


# ===================
# Static Files (for uploaded files)
# ===================

# Ensure uploads directory exists
uploads_path = Path(settings.UPLOAD_DIR)
uploads_path.mkdir(parents=True, exist_ok=True)

# Mount static files for file serving (protected in route)
app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")


# ===================
# Routes
# ===================

app.include_router(api_router, prefix="/api/v1")


# ===================
# Root Endpoint
# ===================

@app.get("/", tags=["Root"])
async def root():
    """API root endpoint."""
    return {
        "name": "CareBridge API",
        "version": "2.0.0",
        "status": "operational",
        "documentation": "/docs" if settings.DEBUG else None,
        "health_check": "/api/v1/health",
    }


# ===================
# Entry Point
# ===================

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )
