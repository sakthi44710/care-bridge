import 'dart:io';
import 'package:dio/dio.dart';
import 'package:carebridge_mobile/config/api_config.dart';
import 'package:carebridge_mobile/models/models.dart';

class ApiService {
  late final Dio _dio;
  String? _firebaseToken;

  // Singleton
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;

  ApiService._internal() {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConfig.apiUrl,
        connectTimeout: const Duration(milliseconds: ApiConfig.connectTimeout),
        receiveTimeout: const Duration(milliseconds: ApiConfig.receiveTimeout),
        sendTimeout: const Duration(milliseconds: ApiConfig.sendTimeout),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (_firebaseToken != null) {
            options.headers['Authorization'] = 'Bearer $_firebaseToken';
          }
          return handler.next(options);
        },
        onError: (error, handler) async {
          return handler.next(error);
        },
      ),
    );
  }

  void setToken(String? token) {
    _firebaseToken = token;
  }

  void clearToken() {
    _firebaseToken = null;
  }

  // ── Auth ────────────────────────────────────────────────
  Future<Map<String, dynamic>> getMe() async {
    final response = await _dio.get('/auth/me');
    return response.data;
  }

  // ── Documents ───────────────────────────────────────────
  Future<List<Document>> getDocuments({
    int page = 1,
    int perPage = 20,
    String? type,
  }) async {
    final response = await _dio.get(
      '/documents',
      queryParameters: {
        'page': page,
        'per_page': perPage,
        if (type != null) 'document_type': type,
      },
    );
    final list = response.data as List? ?? [];
    return list.map((d) => Document.fromJson(d)).toList();
  }

  Future<Document> getDocument(String id) async {
    final response = await _dio.get('/documents/$id');
    return Document.fromJson(response.data);
  }

  Future<Document> uploadDocument(File file, String documentType) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        file.path,
        filename: file.path.split('/').last,
      ),
    });
    final response = await _dio.post(
      '/documents?document_type=$documentType',
      data: formData,
      options: Options(headers: {'Content-Type': 'multipart/form-data'}),
    );
    return Document.fromJson(response.data);
  }

  Future<List<int>> downloadDocument(String id) async {
    final response = await _dio.get(
      '/documents/$id/download',
      options: Options(responseType: ResponseType.bytes),
    );
    return response.data;
  }

  Future<void> deleteDocument(String id) async {
    await _dio.delete('/documents/$id');
  }

  Future<Map<String, dynamic>> verifyDocument(String id) async {
    final response = await _dio.post('/documents/$id/verify');
    return response.data;
  }

  // ── Chat ────────────────────────────────────────────────
  Future<List<Conversation>> getConversations({int page = 1}) async {
    final response = await _dio.get('/chat', queryParameters: {'page': page});
    final list = response.data as List? ?? [];
    return list.map((c) => Conversation.fromJson(c)).toList();
  }

  Future<Conversation> createConversation({String? title}) async {
    final response = await _dio.post(
      '/chat',
      data: {if (title != null) 'title': title},
    );
    return Conversation.fromJson(response.data);
  }

  Future<Conversation> getConversation(String id) async {
    final response = await _dio.get('/chat/$id');
    return Conversation.fromJson(response.data);
  }

  Future<Map<String, dynamic>> sendMessage(
    String conversationId,
    String content,
  ) async {
    final response = await _dio.post(
      '/chat/$conversationId/message',
      data: {'content': content},
    );
    return response.data;
  }

  Future<void> deleteConversation(String id) async {
    await _dio.delete('/chat/$id');
  }

  // ── Health Records ──────────────────────────────────────
  Future<List<HealthRecord>> getHealthRecords({String? type}) async {
    final response = await _dio.get(
      '/health-records',
      queryParameters: {if (type != null) 'record_type': type},
    );
    final list = response.data as List? ?? [];
    return list.map((r) => HealthRecord.fromJson(r)).toList();
  }

  Future<List<Map<String, dynamic>>> getHealthTrends({
    String? metric,
    int days = 90,
  }) async {
    final response = await _dio.get(
      '/health-records/trends',
      queryParameters: {if (metric != null) 'metric': metric, 'days': days},
    );
    final list = response.data as List? ?? [];
    return list.cast<Map<String, dynamic>>();
  }

  Future<void> extractHealthRecords(String documentId) async {
    await _dio.post(
      '/health-records/extract',
      data: {'document_id': documentId},
    );
  }

  Future<Map<String, dynamic>> exportHealthRecords({String? type}) async {
    final response = await _dio.get(
      '/health-records/export',
      queryParameters: {if (type != null) 'record_type': type},
    );
    return response.data;
  }

  // ── Blockchain ──────────────────────────────────────────
  Future<Map<String, dynamic>> anchorDocument(String documentId) async {
    final response = await _dio.post(
      '/blockchain/anchor',
      data: {'document_id': documentId},
    );
    return response.data;
  }

  Future<Map<String, dynamic>> verifyBlockchain(String documentId) async {
    final response = await _dio.get('/blockchain/verify/$documentId');
    return response.data;
  }

  Future<List<BlockchainAudit>> getAuditTrail({int limit = 50}) async {
    final response = await _dio.get(
      '/blockchain/audit',
      queryParameters: {'limit': limit},
    );
    final list = response.data as List? ?? [];
    return list.map((a) => BlockchainAudit.fromJson(a)).toList();
  }

  Future<List<BlockchainAudit>> getBlockchainAudits({int limit = 50}) async {
    return getAuditTrail(limit: limit);
  }

  Future<Map<String, dynamic>> exportFhir({String? type}) async {
    return exportHealthRecords(type: type);
  }

  // ── Doctor-Patient (Care) ───────────────────────────────

  // --- Patient endpoints ---

  // Patient: browse available doctors directory
  Future<List<AvailableDoctor>> getAvailableDoctors() async {
    final response = await _dio.get('/care/patient/available-doctors');
    final list = response.data['doctors'] as List? ?? [];
    return list.map((d) => AvailableDoctor.fromJson(d)).toList();
  }

  // Patient: request appointment with a doctor by ID
  Future<Map<String, dynamic>> requestAppointment(
      String doctorId, String message) async {
    final response = await _dio.post(
      '/care/patient/request-appointment',
      data: {'doctor_id': doctorId, 'message': message},
    );
    return response.data;
  }

  // Patient: view sent appointment requests (pending)
  Future<List<SentAppointmentRequest>> getMyAppointmentRequests() async {
    final response = await _dio.get('/care/patient/appointment-status');
    final list = response.data['requests'] as List? ?? [];
    return list.map((r) => SentAppointmentRequest.fromJson(r)).toList();
  }

  // Patient: get my active doctors
  Future<List<DoctorInfo>> getMyDoctors() async {
    final response = await _dio.get('/care/patient/doctors');
    final list = response.data['doctors'] as List? ?? [];
    return list.map((d) => DoctorInfo.fromJson(d)).toList();
  }

  // Patient: get document access requests from doctors
  Future<List<DocAccessRequest>> getDocumentAccessRequests() async {
    final response = await _dio.get('/care/patient/document-requests');
    final list = response.data['requests'] as List? ?? [];
    return list.map((r) => DocAccessRequest.fromJson(r)).toList();
  }

  // Patient: respond to document access request
  Future<Map<String, dynamic>> respondDocumentAccess(
      String linkId, String action) async {
    final response = await _dio.put(
      '/care/patient/document-requests/$linkId',
      data: {'action': action},
    );
    return response.data;
  }

  // --- Doctor endpoints ---

  // Doctor: get incoming appointment requests
  Future<List<AppointmentRequest>> getAppointmentRequests() async {
    final response = await _dio.get('/care/doctor/appointment-requests');
    final list = response.data['requests'] as List? ?? [];
    return list.map((r) => AppointmentRequest.fromJson(r)).toList();
  }

  // Doctor: respond to appointment request
  Future<Map<String, dynamic>> respondAppointmentRequest(
      String linkId, String action) async {
    final response = await _dio.put(
      '/care/doctor/appointment-requests/$linkId',
      data: {'action': action},
    );
    return response.data;
  }

  // Doctor: get my patients (active)
  Future<List<PatientLink>> getMyPatients() async {
    final response = await _dio.get('/care/doctor/patients');
    final list = response.data['patients'] as List? ?? [];
    return list.map((p) => PatientLink.fromJson(p)).toList();
  }

  // Doctor: request document access from patient
  Future<Map<String, dynamic>> requestDocumentAccess(String linkId) async {
    final response =
        await _dio.post('/care/doctor/patients/$linkId/request-documents');
    return response.data;
  }

  // Doctor: unlink patient
  Future<void> unlinkPatient(String linkId) async {
    await _dio.delete('/care/doctor/patients/$linkId');
  }

  // Doctor: get patient documents (only when access granted)
  Future<List<PatientDocument>> getPatientDocuments(String patientId) async {
    final response =
        await _dio.get('/care/doctor/patients/$patientId/documents');
    final list = response.data['documents'] as List? ?? [];
    return list.map((d) => PatientDocument.fromJson(d)).toList();
  }

  // Get document download URL
  Future<String?> getDocumentUrl(String documentId) async {
    try {
      final response = await _dio.get('/documents/$documentId/url');
      return response.data['download_url'];
    } catch (_) {
      return null;
    }
  }

  // --- Consultations ---
  Future<Map<String, dynamic>> requestConsultation({
    required String doctorId,
    required List<String> documentIds,
    String message = '',
  }) async {
    final response = await _dio.post('/care/consultations', data: {
      'doctor_id': doctorId,
      'document_ids': documentIds,
      'message': message,
    });
    return response.data;
  }

  Future<Map<String, dynamic>> payConsultation(String consultationId) async {
    final response =
        await _dio.post('/care/consultations/$consultationId/pay', data: {});
    return response.data;
  }

  Future<List<Consultation>> listConsultations({String? statusFilter}) async {
    final response = await _dio.get('/care/consultations', queryParameters: {
      if (statusFilter != null) 'status_filter': statusFilter,
    });
    final list = response.data['consultations'] as List? ?? [];
    return list.map((c) => Consultation.fromJson(c)).toList();
  }

  Future<Map<String, dynamic>> getConsultation(String id) async {
    final response = await _dio.get('/care/consultations/$id');
    return response.data;
  }

  Future<Map<String, dynamic>> respondConsultation(
      String id, String responseText) async {
    final response = await _dio.put('/care/consultations/$id/respond', data: {
      'response_text': responseText,
    });
    return response.data;
  }
}
