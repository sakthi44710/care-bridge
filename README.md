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
| **Document Upload & OCR** | Drag-and-drop medical document upload with AI-powered text extraction (NVIDIA Phi-3.5 Vision) |
| **AI Chat Assistant** | Context-aware medical Q&A powered by NVIDIA LLaMA 3.1 70B with document retrieval |
| **Doctor Directory** | Patients browse doctors by department/specialty and book consultations directly |
| **Real-time Consultations** | In-app text-based consultations between doctors and patients (₹500/session) |
| **Document Access Control** | Patients grant/revoke doctor access to their medical records |
| **Health Records** | FHIR-compliant health record management with trend visualization |
| **Blockchain Audit Trail** | Immutable document integrity verification via blockchain logging |
| **Role-based Access** | Patient, Doctor, Clinician, and Admin roles with Firebase Authentication |
| **Multi-platform** | Web (Next.js) + Mobile (Flutter Android/iOS) + Backend API (FastAPI) |
| **Google Sign-In** | Seamless authentication via Google OAuth on both web and mobile |

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
│                   FastAPI Backend (Python)                    │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐    │
│  │ Auth       │  │ AI/OCR     │  │ Doctor-Patient       │    │
│  │ (Firebase) │  │ (NVIDIA)   │  │ Management           │    │
│  └──────┬─────┘  └──────┬─────┘  └──────────┬──────────┘    │
│         │               │                    │               │
│  ┌──────▼─────┐  ┌──────▼─────┐  ┌──────────▼──────────┐    │
│  │ Firebase   │  │ NVIDIA API │  │ Cloud Firestore      │    │
│  │ Admin SDK  │  │ (NIM)      │  │ (Database)           │    │
│  └────────────┘  └────────────┘  └──────────────────────┘    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                Flutter Mobile App (Android/iOS)              │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐    │
│  │ Firebase   │  │ Provider   │  │ Dio HTTP Client      │    │
│  │ Auth       │  │ State Mgmt │  │ + Retrofit           │    │
│  └────────────┘  └────────────┘  └─────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **Python 3.11+** | Runtime |
| **FastAPI** | REST API framework |
| **Firebase Admin SDK** | Authentication & Firestore access |
| **Cloud Firestore** | NoSQL database |
| **Firebase Cloud Storage** | Document file storage |
| **NVIDIA NIM API** | AI inference (LLaMA 3.1 70B chat, Phi-3.5 Vision OCR) |
| **PyMuPDF / PyPDF2** | PDF processing |
| **Docker** | Containerization |

### Frontend (Web)
| Technology | Purpose |
|---|---|
| **Next.js 14** | React framework (static export) |
| **React 18** | UI library |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Styling |
| **shadcn/ui (Radix)** | Component library |
| **Zustand** | State management |
| **Firebase Auth** | Google sign-in authentication |
| **Recharts** | Health data visualization |
| **Framer Motion** | Animations |

### Mobile (Flutter)
| Technology | Purpose |
|---|---|
| **Flutter 3.2+** | Cross-platform framework |
| **Dart** | Language |
| **Firebase Auth + Google Sign-In** | Authentication |
| **Provider** | State management |
| **Dio + Retrofit** | HTTP client |
| **Cloud Firestore** | Real-time data |
| **FL Chart** | Health trend charts |

### Infrastructure
| Technology | Purpose |
|---|---|
| **Firebase Hosting** | Frontend deployment |
| **Docker Compose** | Local development orchestration |
| **Firebase Project** | `care-bridge-ai-334d0` |

---

## Getting Started

### Prerequisites

- **Python 3.11+** — Backend API
- **Node.js 18+** — Frontend development
- **Flutter 3.2+** — Mobile development
- **Docker & Docker Compose** — Container orchestration
- **Firebase CLI** — `npm install -g firebase-tools`
- **NVIDIA API Key** — For AI/OCR features ([build.nvidia.com](https://build.nvidia.com))

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
# AI Services
NVIDIA_API_KEY=your_nvidia_api_key

# Firebase
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=care-bridge-ai-334d0.firebaseapp.com
FIREBASE_PROJECT_ID=care-bridge-ai-334d0
FIREBASE_STORAGE_BUCKET=care-bridge-ai-334d0.firebasestorage.app

# Place your Firebase service account key at:
# backend/firebase-service-account.json
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

> **Note:** For Android emulator, the API base URL is `http://10.0.2.2:8000`. For physical devices, use your machine's local IP.

---

## Project Structure

```
CareBridge/
├── backend/                       # FastAPI backend
│   ├── app/
│   │   ├── main.py                # App entry point & CORS
│   │   ├── config.py              # Configuration
│   │   ├── routes/
│   │   │   ├── auth.py            # Authentication endpoints
│   │   │   ├── documents.py       # Document upload & AI OCR
│   │   │   ├── chat.py            # AI chat assistant
│   │   │   ├── doctor_patient.py  # Doctor-patient management
│   │   │   ├── health.py          # Health metrics & trends
│   │   │   ├── health_records.py  # FHIR health records
│   │   │   └── blockchain.py      # Blockchain audit trail
│   │   ├── services/              # Business logic layer
│   │   ├── core/                  # Core utilities
│   │   └── middleware/            # Auth & CORS middleware
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                      # Next.js web application
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/             # Google sign-in page
│   │   │   ├── select-role/       # Role selection (patient/doctor)
│   │   │   ├── verify-role/       # Role verification pending
│   │   │   └── dashboard/
│   │   │       ├── documents/     # Document management
│   │   │       ├── chat/          # AI chat assistant
│   │   │       ├── my-doctors/    # Doctor directory & booking
│   │   │       ├── patients/      # Doctor's patient management
│   │   │       ├── consultations/ # Consultation sessions
│   │   │       ├── health/        # Health records & trends
│   │   │       ├── blockchain/    # Audit trail viewer
│   │   │       └── admin/         # Admin panel
│   │   ├── components/            # Reusable UI components
│   │   └── lib/                   # API client, auth, stores
│   ├── package.json
│   └── next.config.js             # Static export configuration
│
├── mobile/                        # Flutter mobile app
│   ├── lib/
│   │   ├── main.dart              # App entry point
│   │   ├── firebase_options.dart   # Firebase config
│   │   ├── models/                # Data models (User, Document, etc.)
│   │   ├── services/              # API service (Dio HTTP)
│   │   ├── providers/             # Provider state management
│   │   ├── screens/
│   │   │   ├── landing_screen.dart
│   │   │   ├── login_screen.dart
│   │   │   ├── dashboard_screen.dart
│   │   │   ├── documents_screen.dart
│   │   │   ├── document_upload_screen.dart
│   │   │   ├── chat_screen.dart
│   │   │   ├── my_doctors_screen.dart
│   │   │   ├── my_patients_screen.dart
│   │   │   ├── consultations_screen.dart
│   │   │   ├── health_records_screen.dart
│   │   │   └── blockchain_screen.dart
│   │   ├── widgets/               # Reusable Flutter widgets
│   │   └── config/                # App configuration
│   ├── pubspec.yaml
│   └── android/app/google-services.json
│
├── docker-compose.yml             # Container orchestration
├── firebase.json                  # Firebase Hosting config
├── firestore.rules                # Firestore security rules
├── firestore.indexes.json         # Firestore indexes
└── .env.example                   # Environment variable template
```

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/verify-token` | Verify Firebase ID token |
| `POST` | `/auth/register` | Register user with role |
| `GET` | `/auth/me` | Get current user profile |

### Documents
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/documents/upload` | Upload medical document |
| `GET` | `/documents/` | List user's documents |
| `GET` | `/documents/{id}` | Get document details with AI analysis |
| `POST` | `/documents/{id}/process` | Process document with AI OCR |

### AI Chat
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/chat/` | Send message to AI assistant |
| `GET` | `/chat/history` | Get conversation history |

### Doctor-Patient Management
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/care/patient/available-doctors` | Browse doctor directory by department |
| `POST` | `/care/patient/request-appointment` | Book consultation with a doctor |
| `GET` | `/care/patient/my-doctors` | List connected doctors |
| `GET` | `/care/doctor/my-patients` | List connected patients |
| `POST` | `/care/doctor/respond-appointment` | Accept/reject appointment request |
| `POST` | `/care/patient/toggle-doc-access` | Grant/revoke document access |

### Consultations
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/care/consultation/request` | Request a consultation session |
| `POST` | `/care/consultation/{id}/respond` | Accept/reject consultation |
| `POST` | `/care/consultation/{id}/message` | Send message in consultation |
| `GET` | `/care/consultation/{id}` | Get consultation details & messages |

### Health Records
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health/records` | Get health records |
| `POST` | `/health/records` | Create health record |
| `GET` | `/health/trends` | Get health metric trends |

---

## User Roles

| Role | Capabilities |
|---|---|
| **Patient** | Upload documents, browse doctor directory, book consultations, manage document access, view health records, AI chat |
| **Doctor** | View patient documents (with granted access), accept/reject appointments, conduct consultations, manage patients |
| **Clinician** | Same as Doctor with clinical workflow support |
| **Admin** | Approve doctor/clinician registrations, platform management |

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
| `NVIDIA_API_KEY` | NVIDIA NIM API key for AI inference | Yes |
| `FIREBASE_API_KEY` | Firebase Web API key | Yes |
| `FIREBASE_PROJECT_ID` | Firebase project ID | Yes |
| `FIREBASE_STORAGE_BUCKET` | Firebase Cloud Storage bucket | Yes |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Yes |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase Cloud Messaging sender ID | Yes |
| `FIREBASE_APP_ID` | Firebase Web app ID | Yes |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is proprietary. All rights reserved.

---

<p align="center">
  Built with ❤️ by the CareBridge Team
</p>
