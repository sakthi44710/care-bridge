# CareBridge — AI-Powered Healthcare Document Intelligence Platform

<p align="center">
  <strong>Secure healthcare document management with AI-powered analysis, doctor-patient connectivity, and real-time consultations.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#api-reference">API Reference</a>
</p>

---

## Features

| Feature | Description |
|---|---|
| **Document Upload & AI OCR** | Drag-and-drop medical document upload with AI-powered text extraction via MediX-R1 vision model |
| **AI Chat Assistant** | Context-aware medical Q&A with Mixture of Experts routing and role-adaptive responses |
| **Voice Chat** | Real-time WebSocket voice/text chat powered by Gemini + TTS with multilingual support (Tanglish, Hinglish, Telugu) |
| **AI Document Analysis** | Automatic top-to-bottom document analysis with structured health data extraction |
| **Doctor Directory** | Patients browse doctors by department/specialty and book consultations directly |
| **Real-time Consultations** | In-app text-based consultations between doctors and patients (₹500/session) |
| **Document Access Control** | Patients grant/revoke doctor access to their medical records |
| **Health Records** | FHIR-compliant health record management with trend visualization and export |
| **Blockchain Audit Trail** | Immutable document integrity verification via blockchain-style hashing |
| **Role-based Access** | Patient, Doctor, Clinician, and Admin roles with Firebase Authentication |
| **Multi-platform** | Web (Next.js) + Mobile (Flutter Android/iOS) + Backend API (FastAPI) |
| **Google Sign-In** | Seamless authentication via Google OAuth on both web and mobile |
| **Medical Safety** | AI safety guardrails prevent definitive diagnoses, responses include medical disclaimers |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Firebase Hosting (Frontend)                │
│                     Next.js 14 + React 18                    │
│               Tailwind CSS + shadcn/ui + Zustand             │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS / REST
┌────────────────────────────▼─────────────────────────────────┐
│                   FastAPI Backend (Python 3.11+)              │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Auth         │  │ AI/OCR       │  │ Doctor-Patient      │  │
│  │ (Firebase)   │  │ (Multi-Prov) │  │ Management          │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬───────────┘  │
│         │                │                    │               │
│  ┌──────▼──────┐  ┌──────▼───────┐  ┌────────▼───────────┐  │
│  │ Firebase    │  │ MediX-R1-8B  │  │ Cloud Firestore     │  │
│  │ Admin SDK   │  │ / HF / NVIDIA│  │ (Database)          │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Voice Chat  │  │ Blockchain   │  │ Health Records      │  │
│  │ (Gemini+TTS)│  │ (Audit)      │  │ (FHIR)             │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│                Flutter Mobile App (Android/iOS)               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Firebase    │  │ Provider     │  │ Dio HTTP Client     │  │
│  │ Auth        │  │ State Mgmt   │  │ + Retrofit          │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **Python 3.11+** | Runtime |
| **FastAPI 0.115** | REST API framework |
| **Firebase Admin SDK** | Authentication & Firestore access |
| **Cloud Firestore** | NoSQL database |
| **Firebase Cloud Storage** | Document file storage (with local fallback) |
| **MediX-R1-8B** | Local AI inference via llama-server (GGUF) |
| **HuggingFace API** | Remote AI fallback (Qwen2.5-VL-72B) |
| **NVIDIA NIM API** | Cloud AI (LLaMA 3.1 70B, Phi-3.5 Vision) |
| **Google Gemini** | Voice chat + TTS (Gemini 3 Flash + Aoede) |
| **PyMuPDF / PyPDF2** | PDF processing & text extraction |
| **Prometheus** | Metrics instrumentation |
| **Docker** | Containerization |

### Frontend (Web)
| Technology | Purpose |
|---|---|
| **Next.js 14** | React framework (static export) |
| **React 18** | UI library |
| **TypeScript 5.3** | Type safety |
| **Tailwind CSS 3.4** | Styling |
| **shadcn/ui (Radix)** | Component library |
| **Zustand 4.5** | State management |
| **Firebase Auth** | Google sign-in authentication |
| **Recharts** | Health data visualization |
| **Framer Motion** | Animations |
| **Axios** | HTTP client |

### Mobile (Flutter)
| Technology | Purpose |
|---|---|
| **Flutter 3.2+** | Cross-platform framework |
| **Dart 3.2+** | Language |
| **Firebase Auth + Google Sign-In** | Authentication |
| **Cloud Firestore** | Real-time data |
| **Provider** | State management |
| **Dio + Retrofit** | HTTP client |
| **FL Chart** | Health trend charts |
| **Flutter Markdown** | Markdown rendering |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Firebase Hosting** | Frontend deployment |
| **Docker Compose** | Local development (12 services) |
| **Prometheus + Grafana** | Monitoring |
| **Firebase Project** | `care-bridge-ai-334d0` |

---

## AI System

CareBridge uses a sophisticated multi-provider AI pipeline:

### Providers (configurable via `AI_PROVIDER` env var)

| Provider | Model | Best For |
|---|---|---|
| `local` (default) | MediX-R1-8B GGUF via llama-server | Privacy-first local inference |
| `huggingface` | Qwen/Qwen2.5-VL-72B-Instruct | Remote API fallback |
| `nvidia` | LLaMA 3.1 70B + Phi-3.5 Vision | Cloud-scale inference |

### Mixture of Experts (MoE) Routing

Queries are automatically routed to specialized medical expert prompts:
- **Lab Analysis** — Blood work, cholesterol, glucose, CBC interpretation
- **Medication** — Drug interactions, dosage, side effects
- **Radiology** — X-ray, MRI, CT scan analysis
- **General Health** — Default fallback

### Safety
- Role-aware responses: plain language for patients, clinical terms for doctors
- Medical disclaimers automatically appended
- Blocked phrases prevent AI from making definitive diagnoses
- HIPAA-aligned input sanitization

---

## Getting Started

### Prerequisites

- **Python 3.11+** — Backend API
- **Node.js 18+** — Frontend development
- **Flutter 3.2+** — Mobile development
- **Docker & Docker Compose** — Container orchestration (optional)
- **Firebase CLI** — `npm install -g firebase-tools`

### 1. Clone the Repository

```bash
git clone https://github.com/sakthi44710/care-bridge.git
cd care-bridge
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# AI Provider (local, huggingface, or nvidia)
AI_PROVIDER=local

# For local AI: path to your GGUF model
LOCAL_MODEL_PATH=/path/to/MediX-R1-8B-Q8_0.gguf

# For remote AI (pick one):
NVIDIA_API_KEY=your_nvidia_api_key
HF_API_KEY=your_huggingface_api_key

# For voice chat:
GOOGLE_API_KEY=your_google_gemini_api_key

# Firebase
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=care-bridge-ai-334d0.firebaseapp.com
FIREBASE_PROJECT_ID=care-bridge-ai-334d0
FIREBASE_STORAGE_BUCKET=care-bridge-ai-334d0.firebasestorage.app

# Firebase Service Account (from Firebase Console → Project Settings → Service Accounts)
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_key\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_service_account@care-bridge-ai-334d0.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your_client_id
```

### 3. Start Backend

**Option A — Docker (recommended):**

```bash
docker-compose up -d
```

**Option B — Local development:**

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**For local AI inference**, start llama-server separately:

```bash
backend/llama-server/llama-server.exe -m /path/to/MediX-R1-8B-Q8_0.gguf --port 8081
```

### 4. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Start Mobile App

```bash
cd mobile
flutter pub get
flutter run
```

> **Note:** For Android emulator, the API base URL is `http://10.0.2.2:8000`. For physical devices, update `mobile/lib/config/api_config.dart` with your machine's IP.

---

## Project Structure

```
CareBridge/
├── backend/                       # FastAPI backend
│   ├── app/
│   │   ├── main.py                # App entry, lifespan, exception handlers
│   │   ├── config.py              # Pydantic Settings (env-based)
│   │   ├── routes/
│   │   │   ├── auth.py            # Authentication & role management
│   │   │   ├── documents.py       # Document upload, OCR, analysis, verify
│   │   │   ├── chat.py            # AI chat with document context
│   │   │   ├── doctor_patient.py  # Doctor-patient management & consultations
│   │   │   ├── health.py          # Health check endpoint
│   │   │   ├── health_records.py  # FHIR health records & trends
│   │   │   ├── blockchain.py      # Blockchain audit trail
│   │   │   └── voice.py           # WebSocket voice chat
│   │   ├── services/
│   │   │   ├── ai.py              # AI service (MoE routing, multi-provider)
│   │   │   ├── ocr.py             # OCR (MediX vision + PyPDF2)
│   │   │   ├── analysis.py        # Document analysis service
│   │   │   ├── firebase.py        # Firebase Admin SDK init
│   │   │   ├── storage.py         # Cloud Storage + local fallback
│   │   │   ├── voice_agent.py     # Gemini chat + TTS
│   │   │   └── voice_session.py   # Session management
│   │   ├── core/                  # Auth & exception utilities
│   │   └── middleware/            # Security headers & rate limiting
│   ├── llama-server/              # Pre-built inference server binaries
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                      # Next.js web application
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/             # Google sign-in page
│   │   │   ├── select-role/       # Role selection (patient/doctor)
│   │   │   ├── verify-role/       # Verification pending
│   │   │   └── dashboard/
│   │   │       ├── documents/     # Document management
│   │   │       ├── chat/          # AI chat assistant
│   │   │       ├── my-doctors/    # Doctor directory & booking
│   │   │       ├── patients/      # Doctor's patient management
│   │   │       ├── consultations/ # Consultation sessions
│   │   │       ├── health/        # Health records & trends
│   │   │       ├── blockchain/    # Audit trail viewer
│   │   │       └── admin/         # Admin panel
│   │   ├── components/ui/         # shadcn/ui components
│   │   └── lib/                   # API client, auth, stores, utils
│   ├── package.json
│   └── next.config.js             # Static export configuration
│
├── mobile/                        # Flutter mobile app
│   ├── lib/
│   │   ├── main.dart              # App entry point
│   │   ├── firebase_options.dart  # Firebase config
│   │   ├── models/                # Data models (User, Document, etc.)
│   │   ├── services/              # API service (Dio HTTP)
│   │   ├── providers/             # Provider state management
│   │   ├── screens/               # 12 screens (dashboard, chat, docs, etc.)
│   │   ├── widgets/               # Reusable Flutter widgets
│   │   └── config/                # Theme, routes, API config
│   ├── pubspec.yaml
│   └── android/app/google-services.json
│
├── docs/                          # Documentation
│   ├── API.md                     # API reference
│   ├── AWS_DEPLOYMENT.md          # AWS ECS Fargate deployment
│   ├── DEPLOYMENT.md              # General deployment guide
│   ├── CONTRIBUTING.md            # Contribution guidelines
│   ├── SECURITY.md                # Security documentation
│   └── USER_MANUAL.md             # End-user guide
│
├── infrastructure/                # Monitoring configs
│   ├── prometheus/                # Prometheus config
│   └── grafana/                   # Grafana dashboards
│
├── claude.md                      # AI assistant project context
├── docker-compose.yml             # 12-service container orchestration
├── firebase.json                  # Firebase Hosting config
├── firestore.rules                # Firestore security rules
├── firestore.indexes.json         # Firestore composite indexes
├── FIREBASE_SETUP.md              # Firebase migration guide
├── render.yaml                    # Render deployment (deprecated)
└── .env.example                   # Environment variable template
```

---

## API Reference

All endpoints are prefixed with `/api/v1`. Authentication via `Authorization: Bearer <firebase_id_token>`.

### Authentication (`/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/auth/me` | Get current user profile |
| `PUT` | `/auth/me` | Update profile / set role |
| `POST` | `/auth/verify-token` | Verify Firebase ID token |
| `POST` | `/auth/role-verification` | Submit doctor/clinician verification |
| `GET` | `/auth/admin/pending` | List pending verifications (admin) |
| `POST` | `/auth/admin/verify/{user_id}` | Approve/reject verification (admin) |
| `DELETE` | `/auth/me` | Delete account and all data |

### Documents (`/documents`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/documents/` | Upload document (auto OCR + analysis + blockchain) |
| `GET` | `/documents/` | List documents (paginated) |
| `GET` | `/documents/{id}` | Get document details |
| `GET` | `/documents/{id}/text` | Get full OCR text |
| `GET` | `/documents/{id}/download` | Download original file |
| `GET` | `/documents/{id}/url` | Get signed download URL |
| `DELETE` | `/documents/{id}` | Soft delete document |
| `POST` | `/documents/{id}/verify` | Verify content hash integrity |
| `GET` | `/documents/{id}/analysis` | Get AI analysis |
| `POST` | `/documents/{id}/reanalyze` | Re-trigger AI analysis |

### AI Chat (`/chat`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/chat/` | Create conversation |
| `GET` | `/chat/` | List conversations |
| `GET` | `/chat/{id}` | Get conversation with messages |
| `POST` | `/chat/{id}/message` | Send message, get AI response |
| `PUT` | `/chat/{id}` | Update conversation title |
| `POST` | `/chat/{id}/link-document` | Link document to conversation |
| `DELETE` | `/chat/{id}` | Delete conversation |

### Doctor-Patient Management (`/care`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/care/patient/available-doctors` | Browse doctor directory |
| `POST` | `/care/patient/request-appointment` | Book consultation |
| `GET` | `/care/patient/doctors` | List connected doctors |
| `GET` | `/care/patient/appointment-status` | Check pending requests |
| `GET` | `/care/patient/document-requests` | View access requests |
| `PUT` | `/care/patient/document-requests/{id}` | Grant/deny document access |
| `GET` | `/care/doctor/patients` | List connected patients |
| `GET` | `/care/doctor/appointment-requests` | View incoming requests |
| `PUT` | `/care/doctor/appointment-requests/{id}` | Accept/reject appointment |
| `POST` | `/care/doctor/patients/{id}/request-documents` | Request document access |
| `DELETE` | `/care/doctor/patients/{id}` | Unlink patient |
| `GET` | `/care/doctor/patients/{id}/documents` | View patient documents |

### Consultations (`/care/consultations`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/care/consultations` | Request consultation (₹500) |
| `POST` | `/care/consultations/{id}/pay` | Confirm payment |
| `GET` | `/care/consultations` | List consultations |
| `GET` | `/care/consultations/{id}` | Get consultation details |
| `PUT` | `/care/consultations/{id}/respond` | Doctor responds |

### Health Records (`/health-records`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health-records/` | List health records |
| `GET` | `/health-records/trends` | Get health metric trends |
| `POST` | `/health-records/extract` | AI extraction from document |
| `POST` | `/health-records/sync` | Sync & auto-extract records |
| `GET` | `/health-records/export` | Export as FHIR Bundle |

### Blockchain (`/blockchain`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/blockchain/anchor` | Anchor document hash |
| `GET` | `/blockchain/verify/{id}` | Verify integrity |
| `GET` | `/blockchain/audit` | Get audit trail |
| `POST` | `/blockchain/grant` | Grant document access |
| `POST` | `/blockchain/revoke` | Revoke access |

### Voice (`/voice`)
| Type | Endpoint | Description |
|---|---|---|
| `WebSocket` | `/voice/chat/stream` | Real-time voice/text chat with Gemini + TTS |

---

## User Roles

| Role | Capabilities |
|---|---|
| **Patient** | Upload documents, AI chat, browse doctors, book consultations, manage document access, health records, voice chat |
| **Doctor** | View patient documents (with access), accept/reject appointments, conduct consultations, manage patients |
| **Clinician** | Same as Doctor with clinical workflow support |
| **Admin** | Approve doctor/clinician registrations, view doctors by hospital, platform management |

---

## Deployment

### Firebase Hosting (Frontend Web App)

```bash
# 1. Login to Firebase
firebase login

# 2. Build the static export
cd frontend
npm install
npm run build

# 3. Deploy to Firebase Hosting
cd ..
firebase deploy --only hosting
```

Live URL: **https://care-bridge-ai-334d0.web.app**

### Backend (Docker)

```bash
docker-compose up -d backend
```

### Mobile APK

```bash
cd mobile
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `AI_PROVIDER` | AI backend: `local`, `huggingface`, or `nvidia` | Yes |
| `LOCAL_MODEL_PATH` | Path to GGUF model (if `local`) | Conditional |
| `NVIDIA_API_KEY` | NVIDIA NIM API key (if `nvidia`) | Conditional |
| `HF_API_KEY` | HuggingFace API key (if `huggingface`) | Conditional |
| `GOOGLE_API_KEY` | Google Gemini key (for voice chat) | For voice |
| `FIREBASE_API_KEY` | Firebase Web API key | Yes |
| `FIREBASE_PROJECT_ID` | Firebase project ID | Yes |
| `FIREBASE_STORAGE_BUCKET` | Firebase Cloud Storage bucket | Yes |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Yes |
| `FIREBASE_PRIVATE_KEY` | Service account private key | Yes |
| `FIREBASE_CLIENT_EMAIL` | Service account email | Yes |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase Cloud Messaging sender ID | Yes |
| `FIREBASE_APP_ID` | Firebase Web app ID | Yes |
| `ADMIN_EMAILS` | Comma-separated admin email addresses | Yes |
| `CORS_ORIGINS` | Comma-separated allowed origins | Yes |
| `DEBUG` | Enable debug mode (`true`/`false`) | No |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for detailed guidelines.

---

## License

This project is proprietary. All rights reserved.

---

<p align="center">
  Built with ❤️ by the CareBridge Team
</p>
