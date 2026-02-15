"""Firebase Admin SDK initialization and Firestore client."""
import logging
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore

from app.config import settings

logger = logging.getLogger(__name__)

# Global Firestore client
db: Optional[firestore.Client] = None


def initialize_firebase() -> firestore.Client:
    """
    Initialize Firebase Admin SDK and return Firestore client.
    
    This should be called once during application startup.
    """
    global db
    
    if db is not None:
        return db
    
    try:
        # Check if already initialized
        firebase_admin.get_app()
        logger.info("Firebase already initialized")
    except ValueError:
        # Build credentials from environment
        cred_dict = {
            "type": "service_account",
            "project_id": settings.FIREBASE_PROJECT_ID,
            "private_key_id": settings.FIREBASE_PRIVATE_KEY_ID,
            "private_key": settings.FIREBASE_PRIVATE_KEY.replace("\\n", "\n"),
            "client_email": settings.FIREBASE_CLIENT_EMAIL,
            "client_id": settings.FIREBASE_CLIENT_ID,
            "auth_uri": settings.FIREBASE_AUTH_URI,
            "token_uri": settings.FIREBASE_TOKEN_URI,
            "auth_provider_x509_cert_url": settings.FIREBASE_AUTH_PROVIDER_CERT_URL,
            "client_x509_cert_url": settings.FIREBASE_CLIENT_CERT_URL,
        }
        
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
        logger.info(f"Firebase initialized for project: {settings.FIREBASE_PROJECT_ID}")
    
    db = firestore.client()
    return db


def get_db() -> firestore.Client:
    """Get the Firestore client, initializing if needed."""
    global db
    if db is None:
        db = initialize_firebase()
    return db
