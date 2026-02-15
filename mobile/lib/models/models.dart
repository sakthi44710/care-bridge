class User {
  final String id;
  final String email;
  final String fullName;
  final String role;
  final DateTime? createdAt;

  User({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? '',
      email: json['email'] ?? '',
      fullName: json['full_name'] ?? '',
      role: json['role'] ?? 'patient',
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'full_name': fullName,
        'role': role,
      };
}

class AuthResponse {
  final String accessToken;
  final String refreshToken;
  final String tokenType;
  final int expiresIn;
  final User user;

  AuthResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.tokenType,
    required this.expiresIn,
    required this.user,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      accessToken: json['access_token'] ?? '',
      refreshToken: json['refresh_token'] ?? '',
      tokenType: json['token_type'] ?? 'bearer',
      expiresIn: json['expires_in'] ?? 300,
      user: User.fromJson(json['user'] ?? {}),
    );
  }
}

class Document {
  final String id;
  final String filename;
  final String documentType;
  final String? mimeType;
  final int? fileSize;
  final String status;
  final String? contentHash;
  final String? blockchainTxHash;
  final DateTime? blockchainAnchoredAt;
  final double? ocrConfidence;
  final DateTime? createdAt;

  Document({
    required this.id,
    required this.filename,
    required this.documentType,
    this.mimeType,
    this.fileSize,
    required this.status,
    this.contentHash,
    this.blockchainTxHash,
    this.blockchainAnchoredAt,
    this.ocrConfidence,
    this.createdAt,
  });

  factory Document.fromJson(Map<String, dynamic> json) {
    return Document(
      id: json['id'] ?? '',
      filename: json['filename'] ?? '',
      documentType: json['document_type'] ?? 'other',
      mimeType: json['mime_type'],
      fileSize: json['file_size'],
      status: json['status'] ?? 'uploaded',
      contentHash: json['content_hash'],
      blockchainTxHash: json['blockchain_tx_hash'],
      blockchainAnchoredAt: json['blockchain_anchored_at'] != null
          ? DateTime.tryParse(json['blockchain_anchored_at'])
          : null,
      ocrConfidence: json['ocr_confidence']?.toDouble(),
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])
          : null,
    );
  }
}

class Conversation {
  final String id;
  final String? title;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final List<Message>? messages;

  Conversation({
    required this.id,
    this.title,
    this.createdAt,
    this.updatedAt,
    this.messages,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) {
    return Conversation(
      id: json['id'] ?? '',
      title: json['title'],
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])
          : null,
      updatedAt: json['updated_at'] != null
          ? DateTime.tryParse(json['updated_at'])
          : null,
      messages: json['messages'] != null
          ? (json['messages'] as List).map((m) => Message.fromJson(m)).toList()
          : null,
    );
  }
}

class Message {
  final String id;
  final String content;
  final String role;
  final Map<String, dynamic>? metadata;
  final DateTime? createdAt;

  Message({
    required this.id,
    required this.content,
    required this.role,
    this.metadata,
    this.createdAt,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] ?? '',
      content: json['content'] ?? '',
      role: json['role'] ?? 'user',
      metadata: json['metadata'],
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])
          : null,
    );
  }
}

class HealthRecord {
  final String id;
  final String recordType;
  final String? recordName;
  final String? valueStr;
  final String? unit;
  final String? referenceRange;
  final bool isAbnormal;
  final DateTime? recordDate;
  final DateTime? createdAt;

  HealthRecord({
    required this.id,
    required this.recordType,
    this.recordName,
    this.valueStr,
    this.unit,
    this.referenceRange,
    this.isAbnormal = false,
    this.recordDate,
    this.createdAt,
  });

  String get name => recordName ?? recordType;
  String? get category => recordType;
  double? get value => valueStr != null ? double.tryParse(valueStr!) : null;

  factory HealthRecord.fromJson(Map<String, dynamic> json) {
    return HealthRecord(
      id: json['id'] ?? '',
      recordType: json['record_type'] ?? '',
      recordName: json['record_name'],
      valueStr: json['value']?.toString(),
      unit: json['unit'],
      referenceRange: json['reference_range'],
      isAbnormal: json['is_abnormal'] ?? false,
      recordDate: json['record_date'] != null
          ? DateTime.tryParse(json['record_date'])
          : null,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])
          : null,
    );
  }
}

class BlockchainAudit {
  final String id;
  final String eventType;
  final String txHash;
  final int? blockNumber;
  final String? documentId;
  final String? details;
  final Map<String, dynamic>? payload;
  final DateTime? createdAt;

  BlockchainAudit({
    required this.id,
    required this.eventType,
    required this.txHash,
    this.blockNumber,
    this.documentId,
    this.details,
    this.payload,
    this.createdAt,
  });

  factory BlockchainAudit.fromJson(Map<String, dynamic> json) {
    return BlockchainAudit(
      id: json['id'] ?? '',
      eventType: json['event_type'] ?? '',
      txHash: json['tx_hash'] ?? '',
      blockNumber: json['block_number'],
      documentId: json['document_id'],
      details: json['details'],
      payload: json['payload'],
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'])
          : null,
    );
  }
}

// ── Doctor-Patient Models ──────────────────────────────────

/// Used by doctors to see their active patients
class PatientLink {
  final String linkId;
  final String patientId;
  final String name;
  final String email;
  final String documentAccess; // none | requested | granted | denied
  final String linkedSince;

  PatientLink({
    required this.linkId,
    required this.patientId,
    required this.name,
    required this.email,
    required this.documentAccess,
    required this.linkedSince,
  });

  factory PatientLink.fromJson(Map<String, dynamic> json) {
    return PatientLink(
      linkId: json['link_id'] ?? '',
      patientId: json['patient_id'] ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      documentAccess: json['document_access'] ?? 'none',
      linkedSince: json['linked_since'] ?? '',
    );
  }
}

/// Incoming appointment requests that doctors see
class AppointmentRequest {
  final String linkId;
  final String patientId;
  final String patientName;
  final String patientEmail;
  final String message;
  final String requestedAt;

  AppointmentRequest({
    required this.linkId,
    required this.patientId,
    required this.patientName,
    required this.patientEmail,
    required this.message,
    required this.requestedAt,
  });

  factory AppointmentRequest.fromJson(Map<String, dynamic> json) {
    return AppointmentRequest(
      linkId: json['link_id'] ?? '',
      patientId: json['patient_id'] ?? '',
      patientName: json['patient_name'] ?? '',
      patientEmail: json['patient_email'] ?? '',
      message: json['message'] ?? '',
      requestedAt: json['requested_at'] ?? '',
    );
  }
}

/// Active doctor info shown to patients
class DoctorInfo {
  final String linkId;
  final String doctorId;
  final String name;
  final String email;
  final String specialty;
  final String hospital;
  final String documentAccess;
  final String linkedSince;

  DoctorInfo({
    required this.linkId,
    required this.doctorId,
    required this.name,
    required this.email,
    required this.specialty,
    required this.hospital,
    required this.documentAccess,
    required this.linkedSince,
  });

  factory DoctorInfo.fromJson(Map<String, dynamic> json) {
    return DoctorInfo(
      linkId: json['link_id'] ?? '',
      doctorId: json['doctor_id'] ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      specialty: json['specialty'] ?? '',
      hospital: json['hospital'] ?? '',
      documentAccess: json['document_access'] ?? 'none',
      linkedSince: json['linked_since'] ?? '',
    );
  }
}

/// Sent appointment requests from patient's perspective (pending)
class SentAppointmentRequest {
  final String linkId;
  final String doctorId;
  final String doctorName;
  final String doctorEmail;
  final String doctorSpecialty;
  final String doctorHospital;
  final String message;
  final String requestedAt;

  SentAppointmentRequest({
    required this.linkId,
    required this.doctorId,
    required this.doctorName,
    required this.doctorEmail,
    required this.doctorSpecialty,
    required this.doctorHospital,
    required this.message,
    required this.requestedAt,
  });

  factory SentAppointmentRequest.fromJson(Map<String, dynamic> json) {
    return SentAppointmentRequest(
      linkId: json['link_id'] ?? '',
      doctorId: json['doctor_id'] ?? '',
      doctorName: json['doctor_name'] ?? '',
      doctorEmail: json['doctor_email'] ?? '',
      doctorSpecialty: json['doctor_specialty'] ?? '',
      doctorHospital: json['doctor_hospital'] ?? '',
      message: json['message'] ?? '',
      requestedAt: json['requested_at'] ?? '',
    );
  }
}

/// Document access requests from doctors (shown to patients)
class DocAccessRequest {
  final String linkId;
  final String doctorId;
  final String doctorName;
  final String doctorEmail;
  final String doctorSpecialty;
  final String doctorHospital;
  final String requestedAt;

  DocAccessRequest({
    required this.linkId,
    required this.doctorId,
    required this.doctorName,
    required this.doctorEmail,
    required this.doctorSpecialty,
    required this.doctorHospital,
    required this.requestedAt,
  });

  factory DocAccessRequest.fromJson(Map<String, dynamic> json) {
    return DocAccessRequest(
      linkId: json['link_id'] ?? '',
      doctorId: json['doctor_id'] ?? '',
      doctorName: json['doctor_name'] ?? '',
      doctorEmail: json['doctor_email'] ?? '',
      doctorSpecialty: json['doctor_specialty'] ?? '',
      doctorHospital: json['doctor_hospital'] ?? '',
      requestedAt: json['requested_at'] ?? '',
    );
  }
}

class PatientDocument {
  final String id;
  final String filename;
  final String documentType;
  final String? mimeType;
  final int? fileSize;
  final String? downloadUrl;
  final String status;
  final String? createdAt;

  PatientDocument({
    required this.id,
    required this.filename,
    required this.documentType,
    this.mimeType,
    this.fileSize,
    this.downloadUrl,
    required this.status,
    this.createdAt,
  });

  factory PatientDocument.fromJson(Map<String, dynamic> json) {
    return PatientDocument(
      id: json['id'] ?? '',
      filename: json['filename'] ?? '',
      documentType: json['document_type'] ?? '',
      mimeType: json['mime_type'],
      fileSize: json['file_size'],
      downloadUrl: json['download_url'],
      status: json['status'] ?? 'uploaded',
      createdAt: json['created_at'],
    );
  }
}

class Consultation {
  final String id;
  final String patientName;
  final String patientEmail;
  final String doctorName;
  final String doctorEmail;
  final List<String> documentIds;
  final String message;
  final String status;
  final String paymentStatus;
  final int paymentAmount;
  final String doctorResponse;
  final String? createdAt;
  final String? updatedAt;

  Consultation({
    required this.id,
    required this.patientName,
    required this.patientEmail,
    required this.doctorName,
    required this.doctorEmail,
    required this.documentIds,
    required this.message,
    required this.status,
    required this.paymentStatus,
    required this.paymentAmount,
    required this.doctorResponse,
    this.createdAt,
    this.updatedAt,
  });

  factory Consultation.fromJson(Map<String, dynamic> json) {
    return Consultation(
      id: json['id'] ?? '',
      patientName: json['patient_name'] ?? '',
      patientEmail: json['patient_email'] ?? '',
      doctorName: json['doctor_name'] ?? '',
      doctorEmail: json['doctor_email'] ?? '',
      documentIds: (json['document_ids'] as List?)?.cast<String>() ?? [],
      message: json['message'] ?? '',
      status: json['status'] ?? '',
      paymentStatus: json['payment_status'] ?? '',
      paymentAmount: json['payment_amount'] ?? 500,
      doctorResponse: json['doctor_response'] ?? '',
      createdAt: json['created_at'],
      updatedAt: json['updated_at'],
    );
  }
}

class AvailableDoctor {
  final String id;
  final String name;
  final String email;
  final String specialty;
  final String department;
  final String hospital;
  final int? yearsOfExperience;

  AvailableDoctor({
    required this.id,
    required this.name,
    required this.email,
    required this.specialty,
    required this.department,
    required this.hospital,
    this.yearsOfExperience,
  });

  factory AvailableDoctor.fromJson(Map<String, dynamic> json) {
    return AvailableDoctor(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      specialty: json['specialty'] ?? '',
      department: json['department'] ?? json['specialty'] ?? '',
      hospital: json['hospital'] ?? '',
      yearsOfExperience: json['years_of_experience'],
    );
  }
}
