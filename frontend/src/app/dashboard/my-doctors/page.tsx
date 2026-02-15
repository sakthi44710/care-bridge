'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { careApi, documentsApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Stethoscope, Loader2, AlertCircle, Mail, Building,
  Calendar, FileText, Send, X, CheckCircle, Heart,
  Clock, Lock, Unlock, ShieldCheck, Search, Users,
} from 'lucide-react';
import Link from 'next/link';

interface Doctor {
  link_id: string;
  doctor_id: string;
  name: string;
  email: string;
  specialty: string;
  hospital: string;
  document_access: string;
  linked_since: string;
}

interface AvailableDoctor {
  id: string;
  name: string;
  email: string;
  specialty: string;
  department: string;
  hospital: string;
  years_of_experience: number | null;
}

interface SentRequest {
  link_id: string;
  doctor_id: string;
  doctor_name: string;
  doctor_email: string;
  doctor_specialty: string;
  doctor_hospital: string;
  message: string;
  requested_at: string;
}

interface DocAccessRequest {
  link_id: string;
  doctor_id: string;
  doctor_name: string;
  doctor_email: string;
  doctor_specialty: string;
  doctor_hospital: string;
  requested_at: string;
}

interface Document {
  id: string;
  filename: string;
  document_type: string;
  created_at: string;
}

export default function MyDoctorsPage() {
  const { userData, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [docAccessRequests, setDocAccessRequests] = useState<DocAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Available doctors directory
  const [availableDoctors, setAvailableDoctors] = useState<AvailableDoctor[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');

  // Booking state
  const [bookingDoctor, setBookingDoctor] = useState<AvailableDoctor | null>(null);
  const [bookingMessage, setBookingMessage] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState('');

  // Consultation request state
  const [consultDoctor, setConsultDoctor] = useState<Doctor | null>(null);
  const [myDocuments, setMyDocuments] = useState<Document[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [consultMessage, setConsultMessage] = useState('');
  const [consultLoading, setConsultLoading] = useState(false);
  const [consultSuccess, setConsultSuccess] = useState('');

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    loadData();
    loadAvailableDoctors();
  }, [isAuthenticated]);

  const loadData = async () => {
    try {
      const [doctorsRes, sentRes, docReqRes] = await Promise.all([
        careApi.getMyDoctors(),
        careApi.getMyAppointmentStatus(),
        careApi.getDocumentRequests(),
      ]);
      setDoctors(doctorsRes.data.doctors || []);
      setSentRequests(sentRes.data.requests || []);
      setDocAccessRequests(docReqRes.data.requests || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableDoctors = async () => {
    setDirectoryLoading(true);
    try {
      const res = await careApi.getAvailableDoctors();
      setAvailableDoctors(res.data.doctors || []);
    } catch {
      // non-critical
    } finally {
      setDirectoryLoading(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!bookingDoctor) return;
    setBookingLoading(true);
    setBookingSuccess('');
    setError('');
    try {
      await careApi.requestAppointment(bookingDoctor.id, bookingMessage.trim());
      setBookingSuccess('Appointment request sent! Waiting for doctor to accept.');
      setBookingMessage('');
      await loadData();
      setTimeout(() => {
        setBookingDoctor(null);
        setBookingSuccess('');
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send appointment request');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleRespondDocAccess = async (linkId: string, action: 'accept' | 'reject') => {
    setActionLoading(linkId);
    try {
      await careApi.respondDocumentRequest(linkId, action);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to ${action} document access`);
    } finally {
      setActionLoading(null);
    }
  };

  const openConsultForm = async (doctor: Doctor) => {
    setConsultDoctor(doctor);
    setSelectedDocs([]);
    setConsultMessage('');
    setConsultSuccess('');
    try {
      const res = await documentsApi.list(1, 100);
      setMyDocuments(res.data.documents || []);
    } catch {
      setMyDocuments([]);
    }
  };

  const handleRequestConsultation = async () => {
    if (!consultDoctor || selectedDocs.length === 0) return;
    setConsultLoading(true);
    try {
      const res = await careApi.requestConsultation({
        doctor_id: consultDoctor.doctor_id,
        document_ids: selectedDocs,
        message: consultMessage,
      });
      setConsultSuccess(`Consultation created! Amount: ₹${res.data.payment_amount}. Go to Consultations to pay.`);
      setSelectedDocs([]);
      setConsultMessage('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create consultation');
    } finally {
      setConsultLoading(false);
    }
  };

  const toggleDoc = (docId: string) => {
    setSelectedDocs((prev) =>
      prev.includes(docId) ? prev.filter((d) => d !== docId) : [...prev, docId]
    );
  };

  const docAccessBadge = (access: string) => {
    switch (access) {
      case 'granted':
        return <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50"><Unlock className="h-3 w-3 mr-1" /> Docs Shared</Badge>;
      case 'requested':
        return <Badge variant="outline" className="text-yellow-700 border-yellow-300 bg-yellow-50"><Lock className="h-3 w-3 mr-1" /> Docs Requested</Badge>;
      case 'denied':
        return <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50"><Lock className="h-3 w-3 mr-1" /> Docs Denied</Badge>;
      default:
        return null;
    }
  };

  // Filter available doctors
  const departments = Array.from(new Set(availableDoctors.map((d) => d.department || d.specialty).filter(Boolean)));
  const filteredDoctors = availableDoctors.filter((d) => {
    const matchesSearch =
      !searchQuery ||
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.hospital.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept =
      !selectedDepartment ||
      (d.department || d.specialty) === selectedDepartment;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">My Doctors</h1>
          </div>
          <p className="text-muted-foreground">
            Browse available doctors, book consultations, and manage document access.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm mb-4 flex gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Document Access Requests from Doctors */}
            {docAccessRequests.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="h-5 w-5 text-orange-600" />
                  <h2 className="text-lg font-semibold">Document Access Requests ({docAccessRequests.length})</h2>
                </div>
                <div className="space-y-3">
                  {docAccessRequests.map((req) => (
                    <Card key={req.link_id} className="border-orange-200 bg-orange-50/50">
                      <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row md:items-center gap-4">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="bg-orange-100 p-2 rounded-full">
                              <Lock className="h-6 w-6 text-orange-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold">Dr. {req.doctor_name || 'Doctor'}</h3>
                              <p className="text-sm text-muted-foreground">wants to access your medical documents</p>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
                                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{req.doctor_email}</span>
                                {req.doctor_specialty && <Badge variant="outline" className="text-xs">{req.doctor_specialty}</Badge>}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleRespondDocAccess(req.link_id, 'accept')}
                              disabled={actionLoading === req.link_id}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {actionLoading === req.link_id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Unlock className="mr-1 h-4 w-4" />}
                              Grant Access
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRespondDocAccess(req.link_id, 'reject')}
                              disabled={actionLoading === req.link_id}
                            >
                              <X className="mr-1 h-4 w-4" />
                              Deny
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Sent Requests */}
            {sentRequests.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  <h2 className="text-lg font-semibold">Pending Requests ({sentRequests.length})</h2>
                </div>
                <div className="space-y-3">
                  {sentRequests.map((req) => (
                    <Card key={req.link_id} className="border-yellow-200 bg-yellow-50/50">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-yellow-100 p-2 rounded-full">
                            <Clock className="h-5 w-5 text-yellow-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold">{req.doctor_name || 'Doctor'}</h3>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
                              <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{req.doctor_email}</span>
                              {req.doctor_specialty && <Badge variant="outline" className="text-xs">{req.doctor_specialty}</Badge>}
                              {req.doctor_hospital && (
                                <span className="flex items-center gap-1"><Building className="h-3 w-3" />{req.doctor_hospital}</span>
                              )}
                            </div>
                            {req.message && <p className="text-sm text-muted-foreground mt-1 italic">&quot;{req.message}&quot;</p>}
                            <p className="text-xs text-muted-foreground mt-1">
                              Sent {new Date(req.requested_at).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-yellow-700 border-yellow-300">
                            <Clock className="h-3 w-3 mr-1" />Awaiting Response
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Active Doctors */}
            {doctors.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3">My Doctors ({doctors.length})</h2>
                <div className="space-y-4">
                  {doctors.map((doctor) => (
                    <Card key={doctor.link_id}>
                      <CardContent className="p-5">
                        <div className="flex flex-col md:flex-row md:items-center gap-4">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="bg-blue-100 p-2 rounded-full">
                              <Stethoscope className="h-6 w-6 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-lg">{doctor.name || 'Doctor'}</h3>
                                {doctor.specialty && <Badge variant="outline">{doctor.specialty}</Badge>}
                                {docAccessBadge(doctor.document_access)}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{doctor.email}</span>
                                {doctor.hospital && (
                                  <span className="flex items-center gap-1"><Building className="h-3 w-3" />{doctor.hospital}</span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />Since {new Date(doctor.linked_since).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button onClick={() => openConsultForm(doctor)} variant="outline">
                            <Send className="mr-2 h-4 w-4" />
                            Request Review
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Available Doctors Directory */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Find a Doctor</h2>
              </div>

              {/* Search & Filter */}
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, specialty, or hospital..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {departments.length > 0 && (
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm bg-background"
                  >
                    <option value="">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                )}
              </div>

              {directoryLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredDoctors.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      {searchQuery || selectedDepartment
                        ? 'No doctors match your search.'
                        : 'No doctors available at the moment.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredDoctors.map((doc) => {
                    const alreadyConnected =
                      doctors.some((d) => d.doctor_id === doc.id) ||
                      sentRequests.some((r) => r.doctor_id === doc.id);
                    return (
                      <Card key={doc.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="bg-indigo-100 p-2 rounded-full mt-0.5">
                              <Stethoscope className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold">Dr. {doc.name || 'Doctor'}</h3>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {(doc.department || doc.specialty) && (
                                  <Badge variant="secondary" className="text-xs">
                                    {doc.department || doc.specialty}
                                  </Badge>
                                )}
                                {doc.years_of_experience && (
                                  <Badge variant="outline" className="text-xs">
                                    {doc.years_of_experience} yrs exp
                                  </Badge>
                                )}
                              </div>
                              {doc.hospital && (
                                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                                  <Building className="h-3 w-3" />{doc.hospital}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                <Mail className="h-3 w-3" />{doc.email}
                              </p>
                              <div className="mt-3">
                                {alreadyConnected ? (
                                  <Badge variant="outline" className="text-green-700 border-green-300">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    {doctors.some((d) => d.doctor_id === doc.id) ? 'Connected' : 'Request Sent'}
                                  </Badge>
                                ) : (
                                  <Button size="sm" onClick={() => { setBookingDoctor(doc); setBookingMessage(''); setBookingSuccess(''); }}>
                                    <Calendar className="mr-1 h-3 w-3" />
                                    Book Consultation
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Booking Appointment Modal */}
        {bookingDoctor && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Book Consultation</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setBookingDoctor(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>
                  With Dr. {bookingDoctor.name} — {bookingDoctor.department || bookingDoctor.specialty || 'General'}
                  {bookingDoctor.hospital && ` at ${bookingDoctor.hospital}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {bookingSuccess ? (
                  <div className="text-center py-4">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <p className="text-green-700 font-medium">{bookingSuccess}</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Message (optional)</label>
                      <textarea
                        className="w-full border rounded-md p-2 text-sm min-h-[80px] resize-none bg-transparent"
                        placeholder="Describe why you'd like to schedule a consultation..."
                        value={bookingMessage}
                        onChange={(e) => setBookingMessage(e.target.value)}
                        disabled={bookingLoading}
                      />
                    </div>
                    <Button className="w-full" disabled={bookingLoading} onClick={handleBookAppointment}>
                      {bookingLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Send Appointment Request
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Consultation Request Modal */}
        {consultDoctor && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Request Document Review</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setConsultDoctor(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>
                  With Dr. {consultDoctor.name} — {consultDoctor.specialty || 'General'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {consultSuccess ? (
                  <div className="text-center py-4">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <p className="text-green-700 font-medium">{consultSuccess}</p>
                    <div className="flex gap-2 justify-center mt-4">
                      <Button variant="outline" onClick={() => setConsultDoctor(null)}>Close</Button>
                      <Link href="/dashboard/consultations">
                        <Button>Go to Consultations</Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">Select Documents for Review *</label>
                      {myDocuments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No documents found. Upload documents first.</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                          {myDocuments.map((doc) => (
                            <label
                              key={doc.id}
                              className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-accent/50 ${
                                selectedDocs.includes(doc.id) ? 'bg-primary/10 ring-1 ring-primary' : ''
                              }`}
                            >
                              <input type="checkbox" checked={selectedDocs.includes(doc.id)} onChange={() => toggleDoc(doc.id)} className="rounded" />
                              <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{doc.filename}</p>
                                <p className="text-xs text-muted-foreground">{doc.document_type}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{selectedDocs.length} document(s) selected</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Message to Doctor (optional)</label>
                      <textarea
                        className="w-full border rounded-md p-2 text-sm min-h-[80px] resize-none bg-transparent"
                        placeholder="Describe your concern or what you'd like the doctor to review..."
                        value={consultMessage}
                        onChange={(e) => setConsultMessage(e.target.value)}
                      />
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                      <p className="text-sm font-medium text-yellow-800">Consultation Fee: ₹500</p>
                      <p className="text-xs text-yellow-700 mt-1">Payment is required before the doctor can review your documents.</p>
                    </div>

                    <Button className="w-full" disabled={consultLoading || selectedDocs.length === 0} onClick={handleRequestConsultation}>
                      {consultLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Request Consultation (₹500)
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
