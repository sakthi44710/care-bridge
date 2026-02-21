"""Application configuration with environment variable support."""
from pydantic_settings import BaseSettings
from pathlib import Path
from typing import List
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # ===================
    # Application
    # ===================
    APP_NAME: str = "CareBridge API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "carebridge-secret-key-change-in-production"
    
    # ===================
    # API Keys
    # ===================
    # HuggingFace (for embeddings)
    HF_API_KEY: str = ""
    HF_INFERENCE_URL: str = "https://api-inference.huggingface.co/models"
    
    # NVIDIA API (Primary AI Provider)
    NVIDIA_API_KEY: str = ""
    NVIDIA_MODEL: str = "meta/llama-3.1-70b-instruct"
    NVIDIA_VISION_MODEL: str = "microsoft/phi-3.5-vision-instruct"
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    
    # Google API (Legacy - kept for backward compatibility)
    GOOGLE_API_KEY: str = ""
    
    # ===================
    # Firebase Configuration
    # ===================
    FIREBASE_API_KEY: str = ""
    FIREBASE_AUTH_DOMAIN: str = ""
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_STORAGE_BUCKET: str = ""
    FIREBASE_MESSAGING_SENDER_ID: str = ""
    FIREBASE_APP_ID: str = ""
    FIREBASE_MEASUREMENT_ID: str = ""
    
    # Firebase Service Account (Admin SDK)
    FIREBASE_PRIVATE_KEY_ID: str = ""
    FIREBASE_PRIVATE_KEY: str = ""
    FIREBASE_CLIENT_EMAIL: str = ""
    FIREBASE_CLIENT_ID: str = ""
    FIREBASE_AUTH_URI: str = "https://accounts.google.com/o/oauth2/auth"
    FIREBASE_TOKEN_URI: str = "https://oauth2.googleapis.com/token"
    FIREBASE_AUTH_PROVIDER_CERT_URL: str = "https://www.googleapis.com/oauth2/v1/certs"
    FIREBASE_CLIENT_CERT_URL: str = ""
    
    # ===================
    # CORS Settings
    # ===================
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001,https://care-bridge-ai-334d0.web.app,https://care-bridge-ai-334d0.firebaseapp.com"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins into a list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    # ===================
    # File Storage
    # ===================
    UPLOAD_DIR: str = str(Path(__file__).parent.parent / "uploads")
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_MIME_TYPES: List[str] = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/tiff",
        "image/bmp",
        "image/webp",
    ]
    
    # ===================
    # Rate Limiting
    # ===================
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    
    # ===================
    # Admin Accounts
    # ===================
    ADMIN_EMAILS: str = "sakthiprakashthangaraj@gmail.com,kirthidass.m@gmail.com"
    
    @property
    def admin_emails_list(self) -> List[str]:
        """Parse admin emails into a list."""
        return [e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()]
    
    # ===================
    # AI Safety
    # ===================
    MEDICAL_DISCLAIMER: str = (
        "⚠️ MEDICAL DISCLAIMER: This information is for educational purposes only "
        "and should not be considered medical advice. Always consult with a qualified "
        "healthcare professional for diagnosis and treatment decisions."
    )
    
    class Config:
        # Load from project root .env
        env_file = str(Path(__file__).parent.parent.parent / ".env")
        case_sensitive = True
        extra = "ignore"  # Ignore extra fields in .env


# Global settings instance
settings = Settings()

# Ensure upload directory exists
Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
