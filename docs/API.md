# CareBridge API Documentation

Base URL: `http://localhost:8000/api/v1`

## Authentication

All endpoints (except login) require a Bearer token in the Authorization header:
```
Authorization: Bearer <access_token>
```

---

## Auth Endpoints

### POST /auth/login
Exchange Keycloak credentials for access tokens.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:** `200 OK`
```json
{
  "access_token": "string",
  "refresh_token": "string",
  "token_type": "bearer",
  "expires_in": 300,
  "user": {
    "id": "uuid",
    "email": "string",
    "full_name": "string",
    "role": "patient|provider|admin"
  }
}
```

### POST /auth/refresh
Refresh an expired access token.

### POST /auth/logout
Invalidate the current session.

### GET /auth/me
Get current user profile.

### PUT /auth/me
Update current user profile.

---

## Document Endpoints

### POST /documents/upload
Upload and process a healthcare document.

**Request:** `multipart/form-data`
- `file`: Document file (PDF, image, etc.)
- `document_type`: `lab_result | prescription | radiology | clinical_note | insurance | other`

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "filename": "string",
  "document_type": "string",
  "status": "processing",
  "uploaded_at": "datetime",
  "file_hash": "string"
}
```

### GET /documents/
List user's documents with pagination.

**Query Parameters:**
- `skip` (int, default 0)
- `limit` (int, default 20)
- `document_type` (optional filter)

### GET /documents/{document_id}
Get document details with metadata and blockchain verification status.

### GET /documents/{document_id}/download
Download decrypted document.

### DELETE /documents/{document_id}
Soft-delete a document.

### POST /documents/{document_id}/verify
Verify document integrity via blockchain.

### GET /documents/{document_id}/fhir
Get FHIR representation of document.

---

## Chat Endpoints

### POST /chat/conversations
Create a new AI conversation.

**Request Body:**
```json
{
  "title": "string (optional)"
}
```

### GET /chat/conversations
List user's conversations.

### GET /chat/conversations/{conversation_id}
Get conversation with all messages.

### POST /chat/conversations/{conversation_id}/messages
Send a message and receive AI response.

**Request Body:**
```json
{
  "content": "string"
}
```

**Response:**
```json
{
  "user_message": { "id": "uuid", "content": "string", "role": "user" },
  "ai_message": {
    "id": "uuid",
    "content": "string",
    "role": "assistant",
    "metadata": {
      "expert_used": "lab_analysis|medication_info|radiology|general_health",
      "confidence": 0.85,
      "sources_count": 3,
      "rag_context_used": true
    }
  }
}
```

### DELETE /chat/conversations/{conversation_id}
Delete a conversation.

### WebSocket /chat/ws/{conversation_id}
Real-time streaming chat (token auth via query param).

---

## Health Records Endpoints

### GET /health/records
List health records with optional filters.

**Query Parameters:**
- `record_type` (optional)
- `start_date` (optional, ISO format)
- `end_date` (optional, ISO format)

### GET /health/trends
Get health metric trends over time.

**Query Parameters:**
- `metric` (optional filter)
- `days` (int, default 90)

### POST /health/extract
AI-powered health data extraction from a document.

**Request Body:**
```json
{
  "document_id": "uuid"
}
```

### GET /health/export
Export health records as FHIR Bundle.

**Query Parameters:**
- `format`: `json` (default)

---

## Blockchain Endpoints

### POST /blockchain/anchor
Anchor a document to the blockchain.

**Request Body:**
```json
{
  "document_id": "uuid"
}
```

### GET /blockchain/verify/{document_id}
Verify document integrity on blockchain.

### GET /blockchain/audit
Get blockchain audit trail.

**Query Parameters:**
- `skip` (int, default 0)
- `limit` (int, default 50)

### POST /blockchain/grant
Grant document access to another user.

**Request Body:**
```json
{
  "document_id": "uuid",
  "grantee_id": "uuid",
  "access_level": "read|write",
  "expires_at": "datetime (optional)"
}
```

### POST /blockchain/revoke
Revoke document access.

**Request Body:**
```json
{
  "grant_id": "uuid"
}
```

---

## Health Check

### GET /health
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "database": "connected",
    "redis": "connected",
    "minio": "connected"
  }
}
```

## Error Responses

All errors follow this format:
```json
{
  "detail": "Error description"
}
```

Common HTTP status codes:
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error
