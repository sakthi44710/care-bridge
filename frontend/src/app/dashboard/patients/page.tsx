'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { careApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users, Loader2, AlertCircle, Mail, FileText,
  Calendar, Trash2, ChevronRight, Eye, X,
  Stethoscope, Search, Download, CheckCircle, Bell,
  UserCheck, UserX, Lock, Unlock, ShieldCheck,
} from 'lucide-react';

interface AppointmentRequest {
  link_id: string;
  patient_id: string;
  patient_name: string;
  patient_email: string;
  message: string;
  requested_at: string;
}

interface Patient {
  link_id: string;
  patient_id: string;
  name: string;
  email: string;
  document_access: string; // none | requested | granted | denied
  linked_since: string;
}

interface PatientDocument {
  id: string;
  filename: string;
  document_type: string;
  mime_type: string;
  file_size: number;
  download_url: string | null;
  status: string;
  created_at: string;
}

export default function MyPatientsPage() {
  const { userData, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointmentRequests, setAppointmentRequests] = useState<AppointmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Document viewer state
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<PatientDocument | null>(null);

  const isDoctor = userData?.role === 'doctor' || userData?.role === 'clinician';

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    if (isDoctor) loadData();
  }, [isAuthenticated, isDoctor]);

  const loadData = async () => {
    try {
      const [patientsRes, requestsRes] = await Promise.all([
        careApi.getMyPatients(),
        careApi.getAppointmentRequests(),
      ]);
      setPatients(patientsRes.data.patients || []);
      setAppointmentRequests(requestsRes.data.requests || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleRespondAppointment = async (linkId: string, action: 'accept' | 'reject') => {
    setActionLoading(linkId);
    try {
      await careApi.respondAppointmentRequest(linkId, action);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to ${action} request`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestDocuments = async (linkId: string) => {
    setActionLoading(linkId);
    try {
      await careApi.requestDocumentAccess(linkId);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to request document access');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnlink = async (linkId: string) => {
    if (!confirm('Remove this patient from your care list?')) return;
    try {
      await careApi.unlinkPatient(linkId);
      setPatients((prev) => prev.filter((p) => p.link_id !== linkId));
      if (selectedPatient?.link_id === linkId) {
        setSelectedPatient(null);
        setDocuments([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to unlink patient');
    }
  };

  const handleViewDocuments = async (patient: Patient) => {
    if (patient.document_access !== 'granted') return;
    setSelectedPatient(patient);
    setDocsLoading(true);
    setPreviewDoc(null);
    try {
      const res = await careApi.getPatientDocuments(patient.patient_id);
      setDocuments(res.data.documents || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load patient documents');
    } finally {
      setDocsLoading(false);
    }
  };

  const isPreviewable = (mimeType: string) => {
    return mimeType?.startsWith('image/') || mimeType === 'application/pdf';
  };

  const docAccessBadge = (access: string) => {
    switch (access) {
      case 'granted':
        return <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50"><Unlock className="h-3 w-3 mr-1" /> Documents Shared</Badge>;
      case 'requested':
        return <Badge variant="outline" className="text-yellow-700 border-yellow-300 bg-yellow-50"><Lock className="h-3 w-3 mr-1" /> Access Requested</Badge>;
      case 'denied':
        return <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50"><Lock className="h-3 w-3 mr-1" /> Access Denied</Badge>;
      default:
        return <Badge variant="outline" className="text-gray-600 border-gray-300"><Lock className="h-3 w-3 mr-1" /> No Access</Badge>;
    }
  };

  if (!isDoctor) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-lg mx-auto mt-20">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-blue-100 p-3 rounded-full">
                  <Stethoscope className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <CardTitle>Doctor Access Required</CardTitle>
              <CardDescription>Only verified doctors can access this page.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">My Patients</h1>
          </div>
          <p className="text-muted-foreground">
            Patients who request appointments appear here. Accept to connect, then request document access.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm mb-4 flex gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Appointment Requests */}
        {appointmentRequests.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="h-5 w-5 text-yellow-600" />
              <h2 className="text-lg font-semibold">Appointment Requests ({appointmentRequests.length})</h2>
            </div>
            <div className="space-y-3">
              {appointmentRequests.map((req) => (
                <Card key={req.link_id} className="border-yellow-200 bg-yellow-50/50">
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="bg-yellow-100 p-2 rounded-full">
                          <Bell className="h-6 w-6 text-yellow-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold">{req.patient_name || 'Patient'}</h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />{req.patient_email}
                          </p>
                          {req.message && (
                            <p className="text-sm text-muted-foreground mt-1 italic">&quot;{req.message}&quot;</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Requested {new Date(req.requested_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleRespondAppointment(req.link_id, 'accept')}
                          disabled={actionLoading === req.link_id}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {actionLoading === req.link_id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <UserCheck className="mr-1 h-4 w-4" />
                          )}
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRespondAppointment(req.link_id, 'reject')}
                          disabled={actionLoading === req.link_id}
                        >
                          <UserX className="mr-1 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Patient List */}
          <div>
            <h2 className="text-lg font-semibold mb-3">
              Patients ({patients.length})
            </h2>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : patients.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No patients yet.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    When a patient requests an appointment and you accept, they appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {patients.map((patient) => (
                  <Card
                    key={patient.link_id}
                    className={`transition-colors ${
                      patient.document_access === 'granted' ? 'cursor-pointer hover:bg-accent/50' : ''
                    } ${selectedPatient?.patient_id === patient.patient_id ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => handleViewDocuments(patient)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium truncate">{patient.name || 'Unnamed Patient'}</p>
                            {docAccessBadge(patient.document_access)}
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <Mail className="h-3 w-3" />{patient.email}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <Calendar className="h-3 w-3 inline mr-1" />
                            Since {new Date(patient.linked_since).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {patient.document_access === 'none' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleRequestDocuments(patient.link_id); }}
                              disabled={actionLoading === patient.link_id}
                            >
                              {actionLoading === patient.link_id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <FileText className="mr-1 h-3 w-3" />
                              )}
                              Request Docs
                            </Button>
                          )}
                          {patient.document_access === 'denied' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleRequestDocuments(patient.link_id); }}
                              disabled={actionLoading === patient.link_id}
                            >
                              Re-request
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleUnlink(patient.link_id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {patient.document_access === 'granted' && (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Documents Panel */}
          <div>
            {selectedPatient ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold">
                    {selectedPatient.name || 'Patient'}&apos;s Documents
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedPatient(null); setDocuments([]); setPreviewDoc(null); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {docsLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : documents.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No documents found for this patient.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <Card
                        key={doc.id}
                        className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                          previewDoc?.id === doc.id ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => setPreviewDoc(doc)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-blue-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{doc.filename}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-xs">{doc.document_type}</Badge>
                                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {doc.download_url && (
                                <a href={doc.download_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-500 hover:text-blue-700">
                                  <Download className="h-4 w-4" />
                                </a>
                              )}
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Document Preview */}
                {previewDoc && (
                  <Card className="mt-4">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{previewDoc.filename}</CardTitle>
                        <div className="flex items-center gap-2">
                          {previewDoc.download_url && (
                            <a href={previewDoc.download_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="outline" size="sm"><Download className="mr-1 h-3 w-3" /> Download</Button>
                            </a>
                          )}
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPreviewDoc(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {previewDoc.download_url ? (
                        isPreviewable(previewDoc.mime_type) ? (
                          previewDoc.mime_type === 'application/pdf' ? (
                            <iframe src={previewDoc.download_url} className="w-full h-96 rounded border" title={previewDoc.filename} />
                          ) : (
                            <img src={previewDoc.download_url} alt={previewDoc.filename} className="w-full rounded border max-h-96 object-contain" />
                          )
                        ) : (
                          <div className="text-center py-8">
                            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground mb-3">Preview not available for this file type.</p>
                            <a href={previewDoc.download_url} target="_blank" rel="noopener noreferrer">
                              <Button><Download className="mr-2 h-4 w-4" /> Download File</Button>
                            </a>
                          </div>
                        )
                      ) : (
                        <div className="text-center py-8 text-muted-foreground"><p>No preview available</p></div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-64">
                <div className="text-center text-muted-foreground">
                  <Search className="h-10 w-10 mx-auto mb-3" />
                  <p>Select a patient with granted document access to view their documents</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
