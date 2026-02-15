# CareBridge Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Docker Deployment](#docker-deployment)
4. [Firebase Deployment](#firebase-deployment)
5. [Keycloak Configuration](#keycloak-configuration)
6. [Post-Deployment Verification](#post-deployment-verification)

---

## Prerequisites

- **Docker** 24.0+ & Docker Compose v2
- **Node.js** 18+ & npm 9+
- **Firebase CLI**: `npm install -g firebase-tools`
- **Git**

## Environment Setup

### 1. Create `.env` file

```env
# AI Services
GOOGLE_API_KEY=your_google_gemini_api_key
HF_API_KEY=your_huggingface_api_key

# Firebase
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Database (used by Docker Compose)
POSTGRES_USER=carebridge
POSTGRES_PASSWORD=carebridge_secure_password_2024
POSTGRES_DB=carebridge

# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123

# Keycloak
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=admin_password_change_me

# Vault
VAULT_DEV_ROOT_TOKEN_ID=carebridge-vault-token

# Redis
REDIS_URL=redis://redis:6379/0

# Security
SECRET_KEY=your-256-bit-secret-key-change-in-production
ENCRYPTION_KEY=your-32-byte-encryption-key-hex
```

### 2. Required API Keys

| Service | Where to Get | Purpose |
|---------|-------------|---------|
| Google Gemini API | [Google AI Studio](https://aistudio.google.com/apikey) | AI analysis & chat |
| HuggingFace API | [HuggingFace Settings](https://huggingface.co/settings/tokens) | Text embeddings for RAG |
| Firebase | [Firebase Console](https://console.firebase.google.com) | Frontend hosting |

---

## Docker Deployment

### Start All Services

```bash
docker-compose up -d
```

### Verify Services

```bash
docker-compose ps
```

All services should show `Up (healthy)` or `Up`:

| Service | Port | Health Check |
|---------|------|-------------|
| Backend | 8000 | `curl http://localhost:8000/health` |
| PostgreSQL | 5432 | `docker-compose exec postgres pg_isready` |
| Keycloak | 8080 | `curl http://localhost:8080` |
| MinIO | 9000/9001 | `curl http://localhost:9000/minio/health/live` |
| Redis | 6379 | `docker-compose exec redis redis-cli ping` |
| Vault | 8200 | `curl http://localhost:8200/v1/sys/health` |
| Prometheus | 9090 | `curl http://localhost:9090/-/healthy` |
| Grafana | 3001 | `curl http://localhost:3001/api/health` |

### View Logs

```bash
docker-compose logs -f backend
docker-compose logs -f celery-worker
```

---

## Firebase Deployment

### 1. Login to Firebase

```bash
firebase login
```

### 2. Build the Frontend

```bash
cd frontend
npm install
npm run build
```

This generates static files in `frontend/out/`.

### 3. Deploy

```bash
cd ..
firebase deploy --only hosting
```

Your app will be live at:
- `https://care-bridge-ai-334d0.web.app`
- `https://care-bridge-ai-334d0.firebaseapp.com`

---

## Keycloak Configuration

### 1. Access Admin Console

Navigate to `http://localhost:8080/admin` and login with:
- Username: `admin`
- Password: (value of `KEYCLOAK_ADMIN_PASSWORD` in .env)

### 2. Import Realm

1. Go to **Master realm** dropdown → **Create Realm**
2. Click **Browse** → select `infrastructure/keycloak/carebridge-realm.json`
3. Click **Create**

### 3. Create Users

1. Switch to **carebridge** realm
2. Go to **Users** → **Add user**
3. Fill in details and set password under **Credentials** tab
4. Assign role under **Role mapping** tab

---

## Post-Deployment Verification

### Checklist

- [ ] Backend health endpoint returns healthy
- [ ] Keycloak login page loads at /auth
- [ ] MinIO console accessible at port 9001
- [ ] Frontend loads at Firebase URL
- [ ] Login flow works end-to-end
- [ ] Document upload encrypts and stores correctly
- [ ] AI chat returns responses with medical disclaimer
- [ ] Blockchain anchoring creates audit entries
- [ ] FHIR export generates valid bundles

### Smoke Test

```bash
# 1. Health check
curl http://localhost:8000/health

# 2. Login (after Keycloak setup)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpassword"}'

# 3. Upload document (with token)
curl -X POST http://localhost:8000/api/v1/documents/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@test.pdf" \
  -F "document_type=lab_result"
```
