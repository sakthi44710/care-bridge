import axios from 'axios';
import { getIdToken } from './firebase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add Firebase auth token
api.interceptors.request.use(async (config: any) => {
  const token = await getIdToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle token refresh and network errors
api.interceptors.response.use(
  (response: any) => response,
  async (error: any) => {
    const originalRequest = error.config;

    // Network error (backend unreachable)
    if (!error.response) {
      console.warn('Backend server unreachable:', error.message);
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // Force refresh Firebase token
        const token = await getIdToken(true);
        if (token) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }
      } catch (err) {
        // Token refresh failed, user needs to re-authenticate
        console.error('Token refresh failed:', err);
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth API ─────────────────────────────────────────────
export const authApi = {
  getMe: () => api.get('/auth/me'),
  updateMe: (data: any) => api.put('/auth/me', data),
  verifyToken: () => api.post('/auth/verify-token'),
  submitVerification: (data: any) => api.post('/auth/verify-role', data),
  // Admin endpoints
  getPendingVerifications: () => api.get('/auth/admin/pending-verifications'),
  verifyUser: (userId: string, data: { action: string; reason?: string }) =>
    api.put(`/auth/admin/verify/${userId}`, data),
};

// ── Documents API ────────────────────────────────────────
export const documentsApi = {
  upload: (file: File, documentType?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/documents?document_type=${documentType || 'general'}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: (page = 1, perPage = 20, documentType?: string) =>
    api.get('/documents', { params: { page, per_page: perPage, document_type: documentType } }),
  get: (id: string) => api.get(`/documents/${id}`),
  download: (id: string) =>
    api.get(`/documents/${id}/download`, { responseType: 'blob' }),
  delete: (id: string) => api.delete(`/documents/${id}`),
  verify: (id: string) => api.post(`/documents/${id}/verify`),
  getFhir: (id: string) => api.get(`/documents/${id}/fhir`),
};

// ── Chat API ─────────────────────────────────────────────
export const chatApi = {
  create: (title?: string, documentId?: string) =>
    api.post('/chat', { title, document_id: documentId }),
  list: (page = 1, perPage = 20) =>
    api.get('/chat', { params: { page, per_page: perPage } }),
  get: (id: string) => api.get(`/chat/${id}`),
  sendMessage: (conversationId: string, content: string, documentIds?: string[]) =>
    api.post(`/chat/${conversationId}/message`, { content, document_ids: documentIds }),
  delete: (id: string) => api.delete(`/chat/${id}`),
};

// ── Health Records API ───────────────────────────────────
export const healthRecordsApi = {
  list: (params?: any) => api.get('/health-records', { params: { days_back: 30, ...params } }),
  getTrends: (recordType?: string, months = 12) =>
    api.get('/health-records/trends', { params: { record_type: recordType, months } }),
  extract: (documentId: string) =>
    api.post('/health-records/extract', { document_id: documentId }),
  export: (recordType?: string) =>
    api.get('/health-records/export', { params: { record_type: recordType } }),
  sync: () => api.post('/health-records/sync'),
};

// ── Blockchain API ───────────────────────────────────────
export const blockchainApi = {
  anchor: (documentId: string) =>
    api.post('/blockchain/anchor', { document_id: documentId }),
  verify: (documentId: string) =>
    api.get(`/blockchain/verify/${documentId}`),
  getAudit: (documentId?: string, limit = 50) =>
    api.get('/blockchain/audit', { params: { document_id: documentId, limit } }),
  grant: (data: any) => api.post('/blockchain/grant', data),
  revoke: (grantId: string) =>
    api.post('/blockchain/revoke', { grant_id: grantId }),
};

// ── Doctor-Patient (Care) API ────────────────────────────
export const careApi = {
  // Admin
  getDoctorsByHospital: () => api.get('/care/admin/doctors'),
  // Patient: browse available doctors directory
  getAvailableDoctors: () => api.get('/care/patient/available-doctors'),
  // Patient: request appointment with a doctor (by ID)
  requestAppointment: (doctorId: string, message?: string) =>
    api.post('/care/patient/request-appointment', { doctor_id: doctorId, message: message || '' }),
  getMyAppointmentStatus: () => api.get('/care/patient/appointment-status'),
  // Patient: my doctors + document access requests
  getMyDoctors: () => api.get('/care/patient/doctors'),
  getDocumentRequests: () => api.get('/care/patient/document-requests'),
  respondDocumentRequest: (linkId: string, action: 'accept' | 'reject') =>
    api.put(`/care/patient/document-requests/${linkId}`, { action }),
  // Doctor: appointment requests
  getAppointmentRequests: () => api.get('/care/doctor/appointment-requests'),
  respondAppointmentRequest: (linkId: string, action: 'accept' | 'reject') =>
    api.put(`/care/doctor/appointment-requests/${linkId}`, { action }),
  // Doctor: manage patients
  getMyPatients: () => api.get('/care/doctor/patients'),
  requestDocumentAccess: (linkId: string) =>
    api.post(`/care/doctor/patients/${linkId}/request-documents`),
  unlinkPatient: (linkId: string) => api.delete(`/care/doctor/patients/${linkId}`),
  getPatientDocuments: (patientId: string) =>
    api.get(`/care/doctor/patients/${patientId}/documents`),
  getPatientDocumentDetail: (patientId: string, documentId: string) =>
    api.get(`/care/doctor/patients/${patientId}/documents/${documentId}`),
  // Document URL
  getDocumentUrl: (documentId: string) => api.get(`/documents/${documentId}/url`),
  // Consultations
  requestConsultation: (data: { doctor_id: string; document_ids: string[]; message?: string }) =>
    api.post('/care/consultations', data),
  payConsultation: (consultationId: string, data?: { payment_method?: string; transaction_id?: string }) =>
    api.post(`/care/consultations/${consultationId}/pay`, data || {}),
  listConsultations: (statusFilter?: string) =>
    api.get('/care/consultations', { params: { status_filter: statusFilter } }),
  getConsultation: (consultationId: string) =>
    api.get(`/care/consultations/${consultationId}`),
  respondConsultation: (consultationId: string, responseText: string) =>
    api.put(`/care/consultations/${consultationId}/respond`, { response_text: responseText }),
};

export default api;
