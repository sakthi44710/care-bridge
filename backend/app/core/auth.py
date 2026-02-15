"""Firebase authentication and authorization."""
import logging
from typing import Dict, Any, Optional
from functools import lru_cache

from fastapi import Depends, Header
from firebase_admin import auth as firebase_auth

from app.core.exceptions import AuthenticationError, AuthorizationError

logger = logging.getLogger(__name__)


async def get_authorization_token(
    authorization: Optional[str] = Header(None, alias="Authorization")
) -> str:
    """Extract Bearer token from Authorization header."""
    if not authorization:
        raise AuthenticationError("Authorization header required")
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthenticationError("Invalid authorization format. Use: Bearer <token>")
    
    return parts[1]


def verify_firebase_token(token: str) -> Dict[str, Any]:
    """
    Verify Firebase ID token and return decoded claims.
    
    Args:
        token: Firebase ID token from client
        
    Returns:
        Decoded token containing user info
        
    Raises:
        AuthenticationError: If token is invalid or expired
    """
    try:
        decoded = firebase_auth.verify_id_token(token, check_revoked=True)
        return decoded
    except firebase_auth.RevokedIdTokenError:
        logger.warning("Revoked token attempted")
        raise AuthenticationError("Token has been revoked")
    except firebase_auth.ExpiredIdTokenError:
        raise AuthenticationError("Token has expired")
    except firebase_auth.InvalidIdTokenError as e:
        logger.warning(f"Invalid token: {e}")
        raise AuthenticationError("Invalid authentication token")
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        raise AuthenticationError("Authentication failed")


async def get_current_user(
    token: str = Depends(get_authorization_token)
) -> Dict[str, Any]:
    """
    Dependency to get the current authenticated user.
    
    Returns:
        User info dict with id, email, and other claims
    """
    decoded_token = verify_firebase_token(token)
    
    user_info = {
        "id": decoded_token["uid"],
        "email": decoded_token.get("email"),
        "email_verified": decoded_token.get("email_verified", False),
        "name": decoded_token.get("name"),
        "picture": decoded_token.get("picture"),
        "firebase_claims": decoded_token,
    }
    
    logger.debug(f"Authenticated user: {user_info['id']}")
    return user_info


async def get_optional_user(
    authorization: Optional[str] = Header(None, alias="Authorization")
) -> Optional[Dict[str, Any]]:
    """
    Dependency to optionally get the current user.
    Returns None if no valid auth provided.
    """
    if not authorization:
        return None
    
    try:
        token = authorization.split()[1] if " " in authorization else authorization
        return await get_current_user(token)
    except Exception:
        return None
