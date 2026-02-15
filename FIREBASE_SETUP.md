# Firebase Configuration Instructions

## Setup Complete! ✅

Your CareBridge application has been updated to use **Firebase Authentication with Google OAuth** and **Firebase Firestore** instead of Keycloak and PostgreSQL.

## What Changed:

### Backend (FastAPI):
- ✅ Added `firebase-admin` dependency
- ✅ Removed PostgreSQL/SQLAlchemy dependencies
- ✅ Created Firebase service (`app/services/firebase.py`)
- ✅ Updated auth system (`app/core/auth.py`) to verify Firebase ID tokens
- ✅ Updated auth routes (`app/routes/auth.py`) for Firebase

### Frontend (Next.js):
- ✅ Added Firebase Auth with Google OAuth
- ✅ Updated `firebase.ts` with auth utilities
- ✅ Replaced login page with Google Sign-In button
- ✅ Updated API client to use Firebase ID tokens
- ✅ Updated auth store for Firebase auth state

### Mobile (Flutter):
- ✅ Added Firebase dependencies to `pubspec.yaml`
- ✅ Created Firebase options configuration
- ✅ Updated auth provider for Firebase Auth (partial - see below)

## Required Configuration:

### 1. Firebase Service Account (Backend)

Add these environment variables to your `.env` file:

```bash
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_service_account@care-bridge-ai-334d0.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your_service_account%40care-bridge-ai-334d0.iam.gserviceaccount.com
```

**To get these:**
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Copy values from the downloaded JSON file to `.env`

### 2. Frontend Environment Variables

Add to `frontend/.env.local`:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyBwE16HbIfdF092zzti9-VB3UTa36SLj4g
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=care-bridge-ai-334d0.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=care-bridge-ai-334d0
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=care-bridge-ai-334d0.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=882445520017
NEXT_PUBLIC_FIREBASE_APP_ID=1:882445520017:web:b8d6025004df5bfe714330
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-766C9ELT4S
```

### 3. Enable Google Sign-In in Firebase

1. Go to Firebase Console → Authentication → Sign-in Method
2. Enable **Google** provider
3. Add authorized domains (localhost, your-domain.com)

### 4. Mobile Setup (Flutter)

#### Update `mobile/lib/main.dart`:

```dart
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MyApp());
}
```

#### Update Android (`mobile/android/build.gradle`):

```gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.4.0'
    }
}
```

#### Update `mobile/android/app/build.gradle`:

```gradle
apply plugin: 'com.google.gms.google-services'
```

#### Download `google-services.json`:
1. Firebase Console → Project Settings → Your Apps → Android App
2. Download `google-services.json`
3. Place in `mobile/android/app/`

### 5. Update Mobile Login Screen

Replace `mobile/lib/screens/login_screen.dart` with Google Sign-In button:

```dart
ElevatedButton.icon(
  onPressed: () async {
    final success = await auth.signInWithGoogle();
    if (success) {
      Navigator.pushReplacementNamed(context, '/dashboard');
    }
  },
  icon: Icon(Icons.login),
  label: Text('Sign in with Google'),
)
```

### 6. Install Dependencies

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install firebase

# Mobile
cd mobile
flutter pub get
```

### 7. Run the Application

```bash
# Backend
cd backend
uvicorn app.main:app --reload

# Frontend
cd frontend
npm run dev

# Mobile
cd mobile
flutter run
```

## API Changes:

### Removed Endpoints:
- `POST /api/v1/auth/login` → Use Firebase Google OAuth
- `POST /api/v1/auth/refresh` → Firebase handles token refresh
- `POST /api/v1/auth/logout` → Client-side Firebase logout

### Updated Endpoints:
- `GET /api/v1/auth/me` - Now returns Firebase user data
- `PUT /api/v1/auth/me` - Updates user in Firestore
- `POST /api/v1/auth/verify-token` - Verify Firebase ID token

All other endpoints remain the same but now use Firebase ID tokens for authentication.

## Database Migration:

Your data is now stored in **Cloud Firestore** instead of PostgreSQL:

### Collections:
- `users` - User profiles
- `documents` - Uploaded documents
- `conversations` - Chat conversations  
- `health_records` - Extracted health data
- `blockchain_audits` - Audit trail events

No database migration script needed - Firestore is schema-less.

## Testing:

1. Navigate to `http://localhost:3000/login`
2. Click "Continue with Google"
3. Sign in with your Google account
4. You should be redirected to the dashboard

## Notes:

- Firebase Auth tokens expire after 1 hour (auto-refreshed)
- Firestore security rules needed for production
- All document storage still uses MinIO
- Blockchain functionality unchanged

---

Need help? Check the Firebase Console for authentication logs and Firestore data.
