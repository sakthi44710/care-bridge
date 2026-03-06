# CareBridge Mobile — Static Analysis & Integration Issues

## Summary

Full static code review of the Flutter mobile client against the FastAPI backend.
**No code was run** — all findings are from source inspection.

---

## 🔴 Critical Issues

### 1. Documents List Response Format Mismatch

**File:** `lib/services/api_service.dart` — `getDocuments()`

The mobile app expects the backend to return a **raw JSON array** from `GET /api/v1/documents`:

```dart
final list = response.data as List? ?? [];
return list.map((d) => Document.fromJson(d)).toList();
```

But the backend wraps the response in a `DocumentListResponse` object:

```json
{
  "documents": [...],
  "total": 10,
  "page": 1,
  "per_page": 20
}
```

**Impact:** Every call to `getDocuments()` will either throw a type error or return an empty list.

**Fix:**
```dart
final data = response.data;
final list = (data is List ? data : data['documents'] as List?) ?? [];
return list.map((d) => Document.fromJson(d)).toList();
```

---

### 2. Health Trends Query Parameter Mismatch

**File:** `lib/services/api_service.dart` — `getHealthTrends()`

| Mobile sends | Backend expects |
|---|---|
| `metric` (query param) | `record_type` |
| `days` (e.g. 90) | `months` (e.g. 12) |

The backend route signature: `get_health_trends(record_type: Optional[str], months: int = 12)`

**Impact:** Trend queries silently ignore the mobile-supplied filters and always return default data.

**Fix (mobile):**
```dart
queryParameters: {
  if (metric != null) 'record_type': metric,
  'months': (days / 30).ceil(),
},
```

---

### 3. `DropdownButtonFormField` uses non-existent `initialValue` property

**File:** `lib/screens/document_upload_screen.dart` line 154

```dart
DropdownButtonFormField<String>(
  initialValue: _documentType,    // ← does NOT exist
```

`DropdownButtonFormField` has a `value` property, not `initialValue`.

**Impact:** Compile/lint error or runtime crash depending on Flutter version — the dropdown won't show the initial selection.

**Fix:**
```dart
DropdownButtonFormField<String>(
  value: _documentType,
```

---

### 4. iOS Firebase Config is a Placeholder

**File:** `lib/firebase_options.dart`

```dart
static const FirebaseOptions ios = FirebaseOptions(
  appId: '1:882445520017:ios:YOUR_IOS_APP_ID',  // ← placeholder
```

**Impact:** iOS builds will crash on `Firebase.initializeApp()`.

**Fix:** Register an iOS app in Firebase Console and fill in the real `appId`.

---

## 🟡 Medium Issues

### 5. Google Sign-In SVG loaded via `Image.network` (won't render)

**File:** `lib/screens/login_screen.dart`

```dart
Image.network(
  'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg',
  height: 22,
```

Flutter's `Image.network` does not support SVG rendering. The SVG file will fail to decode and fall through to the `errorBuilder` icon every time.

**Fix:** Use `flutter_svg` (already a dependency) with `SvgPicture.network(...)` or bundle a PNG/vector asset.

---

### 6. Firebase Token Not Auto-Refreshed

**File:** `lib/providers/auth_provider.dart`

The token is set **once** in `_onAuthStateChanged`:

```dart
final token = await user.getIdToken();
_api.setToken(token);
```

Firebase ID tokens expire after **1 hour**. The app never refreshes or forces a new token before API calls.

**Impact:** After 1 hour the backend will return 401s on every API call.

**Fix:** In the Dio interceptor's `onError` handler (or `onRequest`), when a 401 is received, call `user.getIdToken(true)` to force-refresh and retry.

---

### 7. `assets/images/` Directory is Empty

**File:** `pubspec.yaml` declares:

```yaml
assets:
  - assets/images/
```

The directory contains only a README placeholder. A production build with no assets here won't fail, but any code that references `AssetImage('assets/images/...')` will crash.

---

### 8. Document Upload — `document_type` Sent as Query Param Instead of Form Field

**File:** `lib/services/api_service.dart` — `uploadDocument()`

```dart
final response = await _dio.post(
  '/documents?document_type=$documentType',
  data: formData,
```

The backend expects `document_type` as a **query parameter**, which the mobile correctly provides. However, this is inconsistent with the frontend web app which sends it as a form field. Not a bug today, but fragile if the backend changes.

---

### 9. Android Scoped Storage Permissions

**File:** `AndroidManifest.xml`

The manifest declares `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`, but on **Android 13+ (API 33)** these are ignored.

**Impact:** `file_picker` may not work for selecting documents on newer Android devices.

**Fix:** Add:
```xml
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
```
and/or use `requestInstallPackages` scoped access. `file_picker` usually handles this internally, but explicit permissions are safer.

---

### 10. `file.path.split('/')` on Windows/Android

**File:** `lib/services/api_service.dart` — `uploadDocument()`

```dart
filename: file.path.split('/').last,
```

On Windows debugging, file paths use `\` not `/`. Production Android uses `/` so this works there, but during desktop debugging it will send the full path as the filename.

**Fix:** Use `import 'package:path/path.dart'` and `basename(file.path)` or `file.path.split(Platform.pathSeparator).last`.

---

## 🟢 Low / Informational Issues

### 11. No Network Error Handling / Connectivity Check

None of the API calls handle `DioException` types (timeout, connection refused, no internet). Every `catch (_)` block silently swallows errors with no user feedback beyond a loading spinner that stops.

**Recommendation:** Add a global Dio error handler or at minimum surface error messages from `e.response?.data` in `catch` blocks.

---

### 12. `ApiConfig.baseUrl` Hardcoded to Android Emulator

**File:** `lib/config/api_config.dart`

```dart
static const String baseUrl = 'http://10.0.2.2:8000';
```

`10.0.2.2` is the Android emulator alias for `localhost`. This won't work on:
- Physical Android devices
- iOS simulators (use `127.0.0.1`)
- iOS physical devices

**Fix:** Make configurable via environment, flavor, or `--dart-define`. At minimum document the change needed for physical devices.

---

### 13. No Role-Based Route Guards

The app has role-aware UI (doctor vs patient dashboard cards), but **nothing prevents** a patient from manually navigating to `/my-patients` or a doctor navigating to `/my-doctors`. The backend may reject the calls, but the screens show before the error.

---

### 14. Auth State Race Condition on App Start

**File:** `lib/main.dart`

The app always starts at `/` (LandingScreen). The `AuthProvider` listens to `authStateChanges()` async, so even if the user is already logged in, they'll briefly see the landing screen before `_onAuthStateChanged` fires.

**Recommendation:** Show a splash screen and wait for the first auth state emission before deciding the initial route.

---

### 15. Custom Fonts Commented Out

**File:** `pubspec.yaml`

```yaml
# fonts:
#   - family: Inter
```

The `google_fonts` package is included as a dependency but never used in theme.dart — the app falls back to system fonts. This is fine but the commented config and unused dependency add noise.

---

### 16. `PopupMenuItem.onTap` Navigator Timing

**File:** `lib/screens/dashboard_screen.dart`

```dart
PopupMenuItem<String>(
  value: 'blockchain',
  onTap: () {
    if (!context.mounted) return;
    Navigator.pushNamed(context, '/blockchain');
  },
),
```

`PopupMenuItem.onTap` fires **before** the popup menu is fully dismissed, which can cause issues with the navigator. Use the `PopupMenuButton.onSelected` callback instead, or wrap in `WidgetsBinding.instance.addPostFrameCallback`.

---

### 17. Singleton ApiService Not Testable

`ApiService` uses a private constructor singleton pattern. This makes it impossible to mock in unit tests or inject different configurations.

---

## Backend Endpoint Compatibility Matrix

| Mobile Method | Backend Route | Status |
|---|---|---|
| `getMe()` | `GET /auth/me` | ✅ |
| `getDocuments()` | `GET /documents` | 🔴 Response format mismatch |
| `getDocument(id)` | `GET /documents/{id}` | ✅ |
| `uploadDocument()` | `POST /documents` | ✅ |
| `downloadDocument()` | `GET /documents/{id}/download` | ✅ |
| `deleteDocument()` | `DELETE /documents/{id}` | ✅ |
| `verifyDocument()` | `POST /documents/{id}/verify` | ✅ |
| `getDocumentUrl()` | `GET /documents/{id}/url` | ✅ |
| `getConversations()` | `GET /chat` | ✅ |
| `createConversation()` | `POST /chat` | ✅ |
| `getConversation(id)` | `GET /chat/{id}` | ✅ |
| `sendMessage()` | `POST /chat/{id}/message` | ✅ |
| `deleteConversation()` | `DELETE /chat/{id}` | ✅ |
| `getHealthRecords()` | `GET /health-records` | ✅ |
| `getHealthTrends()` | `GET /health-records/trends` | 🔴 Param mismatch |
| `extractHealthRecords()` | `POST /health-records/extract` | ✅ |
| `exportHealthRecords()` | `GET /health-records/export` | ✅ |
| `anchorDocument()` | `POST /blockchain/anchor` | ✅ |
| `verifyBlockchain()` | `GET /blockchain/verify/{id}` | ✅ |
| `getAuditTrail()` | `GET /blockchain/audit` | ✅ |
| `getAvailableDoctors()` | `GET /care/patient/available-doctors` | ✅ |
| `requestAppointment()` | `POST /care/patient/request-appointment` | ✅ |
| `getMyAppointmentRequests()` | `GET /care/patient/appointment-status` | ✅ |
| `getMyDoctors()` | `GET /care/patient/doctors` | ✅ |
| `getDocumentAccessRequests()` | `GET /care/patient/document-requests` | ✅ |
| `respondDocumentAccess()` | `PUT /care/patient/document-requests/{id}` | ✅ |
| `getAppointmentRequests()` | `GET /care/doctor/appointment-requests` | ✅ |
| `respondAppointmentRequest()` | `PUT /care/doctor/appointment-requests/{id}` | ✅ |
| `getMyPatients()` | `GET /care/doctor/patients` | ✅ |
| `requestDocumentAccess()` | `POST /care/doctor/patients/{id}/request-documents` | ✅ |
| `unlinkPatient()` | `DELETE /care/doctor/patients/{id}` | ✅ |
| `getPatientDocuments()` | `GET /care/doctor/patients/{id}/documents` | ✅ |
| `requestConsultation()` | `POST /care/consultations` | ✅ |
| `payConsultation()` | `POST /care/consultations/{id}/pay` | ✅ |
| `listConsultations()` | `GET /care/consultations` | ✅ |
| `getConsultation()` | `GET /care/consultations/{id}` | ✅ |
| `respondConsultation()` | `PUT /care/consultations/{id}/respond` | ✅ |

---

## Firebase Configuration Consistency

| Field | firebase_options.dart (android) | google-services.json | Match? |
|---|---|---|---|
| projectId | `care-bridge-ai-334d0` | `care-bridge-ai-334d0` | ✅ |
| appId | `1:882445520017:android:7424b7200cbd082c714330` | `1:882445520017:android:7424b7200cbd082c714330` | ✅ |
| apiKey | `AIzaSyDoDcjwzeagOj7zODTiNABi6M2-j466vnQ` | `AIzaSyDoDcjwzeagOj7zODTiNABi6M2-j466vnQ` | ✅ |
| messagingSenderId | `882445520017` | `882445520017` | ✅ |
| storageBucket | `care-bridge-ai-334d0.firebasestorage.app` | `care-bridge-ai-334d0.firebasestorage.app` | ✅ |

---

*Generated by static analysis — no code was executed.*
