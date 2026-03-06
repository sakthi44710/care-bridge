# CareBridge — Project Intelligence

> AI-Powered Healthcare Document Intelligence Platform  
> Version 2.0.0 | Python 3.11+ · Next.js 14 · Flutter 3.2+

---

## Quick Reference

| Layer | Tech | Entry Point |
|-------|------|-------------|
| **Backend** | FastAPI 2.0.0 (Python) | `backend/app/main.py` |
| **Frontend** | Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui | `frontend/src/app/page.tsx` |
| **Mobile** | Flutter/Dart, Firebase Auth, Provider, Dio | `mobile/lib/main.dart` |
| **Database** | Cloud Firestore (NoSQL) | Collections: `users`, `documents`, `conversations`, `health_records`, `blockchain_audits`, `doctor_patient_links`, `consultations`, `document_analyses` |
| **Auth** | Firebase Authentication (Google OAuth) | `backend/app/core/auth.py` · `frontend/src/lib/firebase.ts` · `mobile/lib/providers/auth_provider.dart` |
| **File Storage** | Firebase Cloud Storage + local fallback | `backend/app/services/storage.py` |
| **AI/ML** | MediX-R1-8B (local GGUF), HuggingFace, NVIDIA NIM | `backend/app/services/ai.py` |
| **Voice** | Gemini 3 Flash + TTS (Aoede) via WebSocket | `backend/app/routes/voice.py` · `backend/app/services/voice_agent.py` |
| **Infra** | Docker Compose (11 services), Firebase Hosting | `docker-compose.yml` · `firebase.json` |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                Firebase Hosting (Frontend)                    │
│                  Next.js 14 + React 18                       │
│            Tailwind CSS + shadcn/ui + Zustand                │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTPS / REST
┌───────────────────────▼──────────────────────────────────────┐
│                FastAPI Backend (Python 3.11+)                 │
│                                                              │
│  Routes (8):                                                 │
│    /api/v1/auth        — Firebase token auth, roles, admin   │
│    /api/v1/documents   — Upload, OCR, analysis, verify       │
│    /api/v1/chat        — AI conversations with doc context   │
│    /api/v1/care        — Doctor-patient mgmt, consultations  │
│    /api/v1/health-records — FHIR records, trends, export     │
│    /api/v1/blockchain  — Document anchoring, audit trail     │
│    /api/v1/health      — Health check endpoint               │
│    /api/v1/voice       — WebSocket voice chat (Gemini+TTS)   │
│                                                              │
│  Services (7):                                               │
│    ai.py       — MoE routing, safety guards, multi-provider  │
│    ocr.py      — MediX vision OCR + PyPDF2 text extraction   │
│    analysis.py — Document analysis (scan + text)             │
│    firebase.py — Firestore & Firebase Admin SDK init         │
│    storage.py  — Cloud Storage + local fallback              │
│    voice_agent.py   — Gemini chat + TTS pipeline             │
│    voice_session.py — In-memory session management           │
│                                                              │
│  Middleware:                                                 │
│    SecurityHeadersMiddleware — CSP, HSTS, X-Frame-Options    │
│    RateLimitMiddleware — IP-based, 100 req/min               │
│    CORSMiddleware — Configurable origins                     │
│                                                              │
│  Data: Cloud Firestore ──► Firebase Cloud Storage            │
│  AI:   MediX-R1-8B / HuggingFace / NVIDIA NIM               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│               Flutter Mobile App (Android/iOS)               │
│  Firebase Auth + Google Sign-In                              │
│  Provider state management · Dio HTTP + Retrofit             │
│  12 screens · FL Chart · Flutter Markdown                    │
└──────────────────────────────────────────────────────────────┘
```

---

## AI System Design

### Multi-Provider Architecture

Configured via `AI_PROVIDER` env var in `backend/app/config.py`:

| Provider | Model | Use Case |
|----------|-------|----------|
| `local` (default) | MediX-R1-8B Q8_0 GGUF via `llama-server` | Local inference, privacy-first. Runs at `http://127.0.0.1:8081` |
| `huggingface` | Qwen/Qwen2.5-VL-72B-Instruct | Remote fallback via HF Inference API |
| `nvidia` | meta/llama-3.1-70b-instruct + microsoft/phi-3.5-vision-instruct | NVIDIA NIM cloud API |

### Mixture of Experts (MoE) Routing

`MedicalExpertRouter` in `backend/app/services/ai.py` routes queries to domain-specific system prompts:

| Expert | Trigger Keywords |
|--------|-----------------|
| `lab_analysis` | blood, glucose, cholesterol, CBC, lipid, etc. |
| `medication` | medication, drug, dosage, side effect, etc. |
| `radiology` | x-ray, MRI, CT scan, ultrasound, etc. |
| `general_health` | Default fallback |

### Role-Aware Responses

The AI adapts its language based on user role:
- **Patient**: Simple language, no jargon, always includes medical disclaimer
- **Doctor/Clinician**: Technical language, ICD-10 codes, differential diagnoses

### Safety Guardrails

`SafetyGuard` class blocks definitive diagnoses and sanitizes AI responses with medical disclaimers. Blocked patterns include "diagnose you with", "take this medication", etc.

### Voice Chat

WebSocket at `/api/v1/voice/chat/stream`:
1. Accepts text or base64 audio input
2. Gemini 3 Flash Preview for text generation (supports Tanglish/Hinglish/Telugu)
3. Gemini 2.5 Flash Preview TTS (Aoede voice) for speech output
4. Document analysis context injected from Firestore

---

## Backend Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app, lifespan, exception handlers, middleware
│   ├── config.py               # Pydantic Settings (env-based config)
│   ├── __init__.py
│   ├── core/
│   │   ├── auth.py             # get_current_user() — Firebase token verification
│   │   └── exceptions.py       # Custom exceptions (AuthenticationError, NotFoundError, etc.)
│   ├── middleware/
│   │   └── security.py         # SecurityHeaders + RateLimit middleware
│   ├── routes/
│   │   ├── __init__.py         # Router aggregation with prefixes
│   │   ├── auth.py             # User profile, role selection, admin verification
│   │   ├── documents.py        # Upload, list, get, delete, OCR, analysis, blockchain anchor
│   │   ├── chat.py             # Conversations + AI messages with document context
│   │   ├── doctor_patient.py   # Doctor directory, appointments, consultations, document access
│   │   ├── health.py           # Simple health check
│   │   ├── health_records.py   # FHIR records, trends, extraction, sync, export
│   │   ├── blockchain.py       # Anchor, verify, audit trail, access control
│   │   └── voice.py            # WebSocket voice chat endpoint
│   └── services/
│       ├── ai.py               # AIService (892 lines) — MoE, multi-provider, safety
│       ├── ocr.py              # OCRService — MediX vision + PyPDF2
│       ├── analysis.py         # AnalysisService — scan/text document analysis
│       ├── firebase.py         # Firebase Admin SDK initialization, get_db()
│       ├── storage.py          # Upload/download/delete with cloud+local fallback
│       ├── voice_agent.py      # Gemini chat + TTS processing
│       └── voice_session.py    # In-memory voice session manager
├── carebridge-voice-service/   # Standalone voice service (legacy, now integrated)
├── llama-server/               # Pre-built llama.cpp server binaries + CUDA DLLs
├── requirements.txt            # Python dependencies
└── Dockerfile
```

### Key Dependencies (Backend)

```
fastapi==0.115.8, uvicorn==0.34.0, pydantic==2.10.6, pydantic-settings==2.8.1
firebase-admin==6.4.0, httpx==0.28.1, PyMuPDF==1.25.5, PyPDF2==3.0.1
Pillow==11.1.0, google-genai>=1.12.1, websockets==12.0
prometheus-client==0.20.0, prometheus-fastapi-instrumentator==7.0.0
```

---

## Frontend Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing page
│   │   ├── layout.tsx                  # Root layout
│   │   ├── globals.css                 # Global styles
│   │   ├── login/page.tsx              # Google Sign-In page
│   │   ├── select-role/page.tsx        # Role selection (patient/doctor/clinician)
│   │   ├── verify-role/page.tsx        # Role verification pending screen
│   │   └── dashboard/
│   │       ├── page.tsx                # Dashboard home with role-based cards
│   │       ├── layout.tsx              # Dashboard layout with sidebar
│   │       ├── documents/              # Document management (list, detail, upload)
│   │       ├── chat/page.tsx           # AI chat assistant
│   │       ├── my-doctors/page.tsx     # Doctor directory & booking (patient)
│   │       ├── patients/page.tsx       # Patient management (doctor)
│   │       ├── consultations/page.tsx  # Consultation sessions
│   │       ├── health/page.tsx         # Health records & trends
│   │       ├── blockchain/page.tsx     # Audit trail viewer
│   │       └── admin/page.tsx          # Admin panel
│   ├── components/ui/                  # shadcn/ui components (badge, button, card, input)
│   └── lib/
│       ├── api.ts                      # Axios-based API client with auth interceptor
│       ├── firebase.ts                 # Firebase config, auth utilities, Google sign-in
│       ├── store.ts                    # Zustand stores (auth, documents, chat)
│       └── utils.ts                    # cn() utility for Tailwind class merging
├── package.json                        # Next.js 14, React 18, TypeScript 5.3
├── tailwind.config.js                  # Tailwind configuration
├── next.config.js                      # Static export (`output: 'export'`)
└── Dockerfile
```

### Key Dependencies (Frontend)

```
next@14, react@18, typescript@5.3, tailwindcss@3.4.1
firebase@10.14.1, zustand@4.5.0, axios@1.13.5
@radix-ui/* (avatar, dialog, dropdown-menu, label, progress, scroll-area, select, separator, tabs, toast, tooltip)
recharts@2.12.0, framer-motion@11.0.5, react-markdown@9.0.1, react-dropzone@14.2.3, lucide-react
```

---

## Mobile Structure

```
mobile/
├── lib/
│   ├── main.dart                       # App entry, Firebase init, routes
│   ├── firebase_options.dart           # Platform-specific Firebase config
│   ├── config/
│   │   ├── api_config.dart             # API base URL (default: 10.0.2.2:8000)
│   │   ├── routes.dart                 # Named route definitions
│   │   └── theme.dart                  # Material Design theme
│   ├── models/
│   │   └── models.dart                 # Data classes (User, Document, Conversation, etc.)
│   ├── providers/
│   │   ├── auth_provider.dart          # Firebase Auth + Google Sign-In
│   │   └── theme_provider.dart         # Dark/light mode
│   ├── services/
│   │   └── api_service.dart            # Dio HTTP client (singleton)
│   ├── screens/                        # 12 screens
│   │   ├── landing_screen.dart         # Welcome / onboarding
│   │   ├── login_screen.dart           # Google Sign-In
│   │   ├── dashboard_screen.dart       # Role-based dashboard
│   │   ├── documents_screen.dart       # Document list
│   │   ├── document_detail_screen.dart # Document viewer + analysis
│   │   ├── document_upload_screen.dart # File picker + upload
│   │   ├── chat_screen.dart            # AI chat interface
│   │   ├── my_doctors_screen.dart      # Doctor directory (patient)
│   │   ├── my_patients_screen.dart     # Patient list (doctor)
│   │   ├── consultations_screen.dart   # Consultation sessions
│   │   ├── health_records_screen.dart  # Health records + charts
│   │   └── blockchain_screen.dart      # Audit trail
│   └── widgets/                        # Reusable widgets
├── pubspec.yaml                        # Flutter dependencies
├── android/app/google-services.json    # Firebase Android config
└── claude.md                           # Mobile-specific static analysis & known issues
```

### Key Dependencies (Mobile)

```
firebase_core, firebase_auth, google_sign_in, cloud_firestore
provider, dio, retrofit, fl_chart, flutter_markdown
file_picker, open_filex, cached_network_image, shimmer, google_fonts
```

---

## User Roles & Auth Flow

### Roles

| Role | Capabilities |
|------|-------------|
| **Patient** | Upload docs, AI chat, browse doctors, book appointments, manage document access, health records |
| **Doctor** | View patient docs (with access), accept/reject appointments, conduct consultations |
| **Clinician** | Same as Doctor with clinical workflow support |
| **Admin** | Approve doctor/clinician registrations, view all doctors by hospital |

### Auth Flow

1. User signs in via **Google OAuth** (Firebase Auth)
2. Firebase ID token sent as `Authorization: Bearer <token>` on all API calls
3. Backend verifies token via Firebase Admin SDK (`get_current_user()`)
4. First-time users choose role at `/select-role`
5. Patients get instant access; doctors/clinicians enter pending state
6. Admin approves pending verifications at `/dashboard/admin`
7. Admin emails configured in `ADMIN_EMAILS` env var

### Firestore Collections

| Collection | Key Fields |
|-----------|-----------|
| `users` | `email`, `name`, `role`, `verification_status`, `picture` |
| `documents` | `user_id`, `filename`, `document_type`, `mime_type`, `ocr_text`, `status`, `content_hash`, `storage_path` |
| `conversations` | `user_id`, `title`, `document_id`, `messages` (subcollection) |
| `health_records` | `user_id`, `record_type`, `name`, `value`, `unit`, `source_document_id` |
| `blockchain_audits` | `user_id`, `document_id`, `content_hash`, `tx_hash`, `block_number` |
| `doctor_patient_links` | `patient_id`, `doctor_id`, `status`, `document_access` |
| `consultations` | `patient_id`, `doctor_id`, `status`, `payment_status`, `messages` |
| `document_analyses` | `analysis` (markdown text), `status`, `model_used` |

---

## API Endpoints

All routes are prefixed with `/api/v1`.

### Auth (`/auth`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/me` | Get current user profile (creates if not exists) |
| PUT | `/me` | Update profile, set initial role |
| POST | `/verify-token` | Validate Firebase ID token |
| POST | `/role-verification` | Submit doctor/clinician verification |
| GET | `/admin/pending` | List pending verifications (admin only) |
| POST | `/admin/verify/{user_id}` | Approve/reject verification (admin only) |
| DELETE | `/me` | Delete account and all data |

### Documents (`/documents`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Upload document + auto OCR + auto analysis + auto blockchain anchor |
| GET | `/` | List documents (paginated, filterable) |
| GET | `/{id}` | Get document details |
| GET | `/{id}/text` | Get full OCR text |
| GET | `/{id}/download` | Download original file |
| GET | `/{id}/url` | Get signed download URL |
| DELETE | `/{id}` | Soft delete |
| POST | `/{id}/verify` | Verify content hash integrity |
| POST | `/{id}/analyze` | Extract structured health data via AI |
| GET | `/{id}/analysis` | Get cached AI analysis |
| POST | `/{id}/reanalyze` | Re-trigger AI analysis |
| GET | `/file/{path}` | Serve locally-stored files |

### Chat (`/chat`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create conversation (optionally linked to document) |
| GET | `/` | List conversations (paginated) |
| GET | `/{id}` | Get conversation with messages |
| POST | `/{id}/message` | Send message, get AI response |
| PUT | `/{id}` | Update conversation title |
| POST | `/{id}/link-document` | Link document to conversation |
| DELETE | `/{id}` | Delete conversation |

### Doctor-Patient (`/care`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/patient/available-doctors` | Browse verified doctors |
| POST | `/patient/request-appointment` | Request appointment by doctor ID |
| GET | `/patient/doctors` | List connected doctors |
| GET | `/patient/appointment-status` | Check pending requests |
| GET | `/patient/document-requests` | View doctor document access requests |
| PUT | `/patient/document-requests/{id}` | Grant/deny document access |
| GET | `/doctor/patients` | List connected patients |
| GET | `/doctor/appointment-requests` | View incoming requests |
| PUT | `/doctor/appointment-requests/{id}` | Accept/reject appointment |
| POST | `/doctor/patients/{id}/request-documents` | Request document access |
| DELETE | `/doctor/patients/{id}` | Unlink patient |
| GET | `/doctor/patients/{id}/documents` | View patient's documents |
| POST | `/consultations` | Request consultation (₹500 fee) |
| POST | `/consultations/{id}/pay` | Confirm payment |
| GET | `/consultations` | List consultations |
| GET | `/consultations/{id}` | Get consultation details + messages |
| PUT | `/consultations/{id}/respond` | Doctor responds to consultation |
| GET | `/admin/doctors-by-hospital` | Admin: doctors grouped by hospital |

### Health Records (`/health-records`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List records (filterable, last N days) |
| GET | `/trends` | Trend data grouped by type |
| POST | `/extract` | AI extraction from document |
| POST | `/sync` | Remove orphans, auto-extract missing |
| GET | `/export` | FHIR Bundle (JSON) export |

### Blockchain (`/blockchain`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/anchor` | Anchor document hash (mock blockchain) |
| GET | `/verify/{id}` | Verify integrity |
| GET | `/audit` | Audit trail (filterable, paginated) |
| POST | `/grant` | Grant document access on-chain |
| POST | `/revoke` | Revoke access |

### Voice (`/voice`)
| Type | Path | Description |
|------|------|-------------|
| WebSocket | `/chat/stream` | Real-time voice/text chat with Gemini+TTS |

---

## Configuration

### Environment Variables (Key)

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_PROVIDER` | `local`, `huggingface`, or `nvidia` | `local` |
| `LLAMA_SERVER_URL` | llama-server endpoint | `http://127.0.0.1:8081` |
| `LOCAL_MODEL_PATH` | Path to GGUF model file | `D:/MediX-R1-8B-quantized/MediX-R1-8B-Q8_0.gguf` |
| `NVIDIA_API_KEY` | NVIDIA NIM API key | — |
| `HF_API_KEY` | HuggingFace API key | — |
| `GOOGLE_API_KEY` | Google Gemini key (for voice chat) | — |
| `FIREBASE_PROJECT_ID` | Firebase project | `care-bridge-ai-334d0` |
| `FIREBASE_STORAGE_BUCKET` | Cloud Storage bucket | — |
| `FIREBASE_PRIVATE_KEY` | Service account private key | — |
| `FIREBASE_CLIENT_EMAIL` | Service account email | — |
| `CORS_ORIGINS` | Comma-separated allowed origins | localhost + Firebase domains |
| `ADMIN_EMAILS` | Comma-separated admin emails | — |
| `RATE_LIMIT_REQUESTS` | Requests per window | `100` |
| `DEBUG` | Enable debug mode | `false` |

### Running Locally

```bash
# Backend
cd backend
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# For local AI: start llama-server separately
backend/llama-server/llama-server.exe -m D:/MediX-R1-8B-quantized/MediX-R1-8B-Q8_0.gguf --port 8081

# Frontend
cd frontend
npm install && npm run dev

# Mobile
cd mobile
flutter pub get && flutter run
```

---

## Docker Compose Services

| Service | Image/Build | Port | Purpose |
|---------|-------------|------|---------|
| `frontend` | `./frontend` | 3000 | Next.js web app |
| `backend` | `./backend` | 8000 | FastAPI API |
| `postgres` | pgvector/pgvector:pg16 | 5432 | Database (legacy, Firestore is primary) |
| `redis` | redis:7-alpine | 6379 | Cache & message broker |
| `minio` | minio/minio:latest | 9000/9001 | Object storage (legacy) |
| `keycloak` | keycloak:24.0 | 8080 | Identity (legacy, Firebase is primary) |
| `vault` | hashicorp/vault:latest | 8200 | Secrets management |
| `celery-worker` | `./backend` | — | Background tasks |
| `celery-beat` | `./backend` | — | Scheduled tasks |
| `fabric-peer` | hyperledger/fabric-peer:2.5 | 7051 | Blockchain (dev) |
| `prometheus` | prom/prometheus | 9090 | Metrics collection |
| `grafana` | grafana/grafana | 3001 | Monitoring dashboards |

> **Note:** The production stack uses Firebase (Auth, Firestore, Cloud Storage, Hosting) instead of Keycloak/PostgreSQL/MinIO. Docker Compose retains legacy services for local development compatibility.

---

## Deployment

| Target | Method | Details |
|--------|--------|---------|
| **Frontend** | Firebase Hosting | `firebase deploy --only hosting` → static export from `frontend/out/` |
| **Backend** | Docker / Render / AWS ECS Fargate | See `docs/AWS_DEPLOYMENT.md`, `render.yaml` (deprecated) |
| **Mobile** | APK build | `flutter build apk --release` |

Live URL: **https://care-bridge-ai-334d0.web.app**

---

## Known Issues & Technical Debt

See `mobile/claude.md` for detailed Flutter-specific issues. Key items:

1. **Documents list response mismatch** — Mobile expects raw array, backend returns `{documents: [...], total, page, per_page}`
2. **Health trends param mismatch** — Mobile sends `metric`/`days`, backend expects `record_type`/`months`
3. **Firebase token not auto-refreshed** on mobile — tokens expire after 1 hour
4. **iOS Firebase config** is a placeholder — will crash on iOS builds
5. **Docker Compose has legacy services** (PostgreSQL, Keycloak, MinIO) that are no longer used in production
6. **Blockchain is mock** — uses deterministic hash generation, not a real distributed ledger
7. **`docs/API.md` is outdated** — references Keycloak login flow; actual API uses Firebase Auth
8. **Rate limiting is in-memory** — resets on server restart, doesn't work across multiple instances

---

## Development Conventions

- **API prefix**: All routes under `/api/v1`
- **Auth**: Firebase ID tokens via `Authorization: Bearer` header
- **Error format**: `{"error": "error_code", "message": "...", "details": {...}}`
- **Pagination**: `page` + `per_page` query params
- **File uploads**: `multipart/form-data` with `document_type` as query param
- **State management**: Zustand (frontend), Provider (mobile)
- **Styling**: Tailwind CSS + shadcn/ui (frontend), Material Design (mobile)
- **AI responses**: Always include medical disclaimer for patients; no disclaimers for first messages in doctor/clinician mode
- **Document pipeline**: Upload → OCR → AI Analysis → Blockchain Anchor (all automatic)

---

## Security

- Firebase Authentication with Google OAuth
- Firebase ID token verification on every API call
- Firestore security rules enforce user-level data isolation
- Security headers middleware (CSP, HSTS, X-Frame-Options, XSS Protection)
- Rate limiting (100 req/min per IP)
- Content hash verification for document integrity
- CORS restricted to configured origins
- AI safety guardrails prevent definitive medical diagnoses

---

*Generated from full source analysis — covers all backend routes, services, frontend pages, mobile screens, and infrastructure.*
