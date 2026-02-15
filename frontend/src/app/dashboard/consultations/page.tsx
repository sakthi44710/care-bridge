'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { careApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText, Loader2, AlertCircle, CreditCard, Clock, CheckCircle,
  MessageSquare, X, Eye, Send, DollarSign, Stethoscope,
  Calendar, Mail, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Consultation {
  id: string;
  patient_name: string;
  patient_email: string;
  doctor_name: string;
  doctor_email: string;
  document_ids: string[];
  message: string;
  status: string;
  payment_status: string;
  payment_amount: number;
  doctor_response: string;
  created_at: string;
  updated_at: string;
}

interface ConsultationDetail extends Consultation {
  documents: Array<{
    id: string;
    filename: string;
    document_type: string;
    ocr_text: string;
    created_at: string;
  }>;
  payment_data: {
    method?: string;
    transaction_id?: string;
    paid_at?: string;
  };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending_payment: { label: 'Pending Payment', color: 'bg-yellow-100 text-yellow-800', icon: CreditCard },
  in_review: { label: 'In Review', color: 'bg-blue-100 text-blue-800', icon: Eye },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
};

export default function ConsultationsPage() {
  const { userData, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payLoading, setPayLoading] = useState<string | null>(null);

  // Detail/response view
  const [viewId, setViewId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConsultationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [respondLoading, setRespondLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isDoctor = userData?.role === 'doctor' || userData?.role === 'clinician';

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadConsultations();
  }, [isAuthenticated]);

  const loadConsultations = async () => {
    try {
      const res = await careApi.listConsultations();
      setConsultations(res.data.consultations || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load consultations');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async (consultationId: string) => {
    setPayLoading(consultationId);
    try {
      await careApi.payConsultation(consultationId, { payment_method: 'online' });
      // Refresh list
      loadConsultations();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Payment failed');
    } finally {
      setPayLoading(null);
    }
  };

  const handleViewDetail = async (consultationId: string) => {
    if (viewId === consultationId) {
      setViewId(null);
      setDetail(null);
      return;
    }
    setViewId(consultationId);
    setDetailLoading(true);
    try {
      const res = await careApi.getConsultation(consultationId);
      setDetail(res.data);
      setResponseText(res.data.doctor_response || '');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load consultation');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRespond = async () => {
    if (!detail || !responseText.trim()) return;
    setRespondLoading(true);
    try {
      await careApi.respondConsultation(detail.id, responseText);
      loadConsultations();
      setViewId(null);
      setDetail(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to submit response');
    } finally {
      setRespondLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-800', icon: Clock };
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Consultations</h1>
          </div>
          <p className="text-muted-foreground">
            {isDoctor
              ? 'Review patient documents and provide medical feedback.'
              : 'Track your document review consultations and payments.'}
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm mb-4 flex gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-yellow-100 p-2 rounded-lg">
                <CreditCard className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {consultations.filter((c) => c.status === 'pending_payment').length}
                </p>
                <p className="text-sm text-muted-foreground">Pending Payment</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Eye className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {consultations.filter((c) => c.status === 'in_review').length}
                </p>
                <p className="text-sm text-muted-foreground">In Review</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {consultations.filter((c) => c.status === 'completed').length}
                </p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Consultation List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : consultations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold">No Consultations</h3>
              <p className="text-muted-foreground">
                {isDoctor
                  ? 'Patient consultation requests will appear here.'
                  : 'Request a document review from your doctor.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {consultations.map((consultation) => (
              <Card key={consultation.id} className="overflow-hidden">
                <div className={`h-1 ${
                  consultation.status === 'completed' ? 'bg-green-500' :
                  consultation.status === 'in_review' ? 'bg-blue-500' : 'bg-yellow-500'
                }`} />
                <CardContent className="p-5">
                  <div className="flex flex-col gap-3">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {isDoctor ? (
                            <p className="font-semibold">
                              Patient: {consultation.patient_name || consultation.patient_email}
                            </p>
                          ) : (
                            <p className="font-semibold">
                              Dr. {consultation.doctor_name || consultation.doctor_email}
                            </p>
                          )}
                          {getStatusBadge(consultation.status)}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {consultation.document_ids.length} document(s)
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            ₹{consultation.payment_amount}
                            {consultation.payment_status === 'paid' && (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(consultation.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {consultation.message && (
                          <p className="text-sm mt-2 bg-muted p-2 rounded">
                            &ldquo;{consultation.message}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        {/* Patient: pay button */}
                        {!isDoctor && consultation.status === 'pending_payment' && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            disabled={payLoading === consultation.id}
                            onClick={() => handlePay(consultation.id)}
                          >
                            {payLoading === consultation.id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <CreditCard className="mr-1 h-3 w-3" />
                            )}
                            Pay ₹{consultation.payment_amount}
                          </Button>
                        )}

                        {/* View detail */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetail(consultation.id)}
                        >
                          {viewId === consultation.id ? (
                            <ChevronUp className="mr-1 h-3 w-3" />
                          ) : (
                            <ChevronDown className="mr-1 h-3 w-3" />
                          )}
                          {viewId === consultation.id ? 'Hide' : 'Details'}
                        </Button>
                      </div>
                    </div>

                    {/* Doctor response preview */}
                    {consultation.doctor_response && consultation.status === 'completed' && (
                      <div className="bg-green-50 border border-green-200 rounded-md p-3">
                        <p className="text-xs font-medium text-green-800 mb-1 flex items-center gap-1">
                          <Stethoscope className="h-3 w-3" /> Doctor&apos;s Response:
                        </p>
                        <p className="text-sm text-green-900">{consultation.doctor_response}</p>
                      </div>
                    )}

                    {/* Expanded Detail */}
                    {viewId === consultation.id && (
                      <div className="border-t pt-4 mt-2">
                        {detailLoading ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : detail ? (
                          <div className="space-y-4">
                            {/* Documents */}
                            {detail.documents && detail.documents.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium mb-2">Documents</h4>
                                <div className="space-y-2">
                                  {detail.documents.map((doc) => (
                                    <div key={doc.id} className="bg-muted rounded-md p-3">
                                      <div className="flex items-center gap-2 mb-2">
                                        <FileText className="h-4 w-4 text-blue-500" />
                                        <span className="font-medium text-sm">{doc.filename}</span>
                                        <Badge variant="outline" className="text-xs">{doc.document_type}</Badge>
                                      </div>
                                      {doc.ocr_text && (
                                        <pre className="text-xs whitespace-pre-wrap font-mono max-h-40 overflow-y-auto bg-background p-2 rounded">
                                          {doc.ocr_text}
                                        </pre>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Payment info */}
                            {detail.payment_data?.paid_at && (
                              <div className="text-sm text-muted-foreground">
                                <p>
                                  Payment: {detail.payment_data.method || 'Online'} — 
                                  TXN: {detail.payment_data.transaction_id} — 
                                  {new Date(detail.payment_data.paid_at).toLocaleString()}
                                </p>
                              </div>
                            )}

                            {/* Doctor response form (for doctors with paid consultations) */}
                            {isDoctor && detail.status === 'in_review' && (
                              <div className="border-t pt-4">
                                <h4 className="text-sm font-medium mb-2">Your Response</h4>
                                <textarea
                                  className="w-full border rounded-md p-3 text-sm min-h-[120px] resize-none bg-transparent"
                                  placeholder="Review the documents and provide your medical feedback..."
                                  value={responseText}
                                  onChange={(e) => setResponseText(e.target.value)}
                                />
                                <Button
                                  className="mt-2"
                                  disabled={respondLoading || !responseText.trim()}
                                  onClick={handleRespond}
                                >
                                  {respondLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Send className="mr-2 h-4 w-4" />
                                  )}
                                  Submit Response
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
