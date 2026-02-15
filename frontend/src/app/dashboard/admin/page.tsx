'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { authApi, careApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Shield, CheckCircle, XCircle, Loader2, AlertCircle,
  Stethoscope, UserCog, Clock, Mail, User, Building,
  Award, Calendar, ArrowLeft, Hospital, Users,
} from 'lucide-react';
import Link from 'next/link';

interface PendingUser {
  id: string;
  email: string;
  name: string;
  role: string;
  verification_status: string;
  verification_data: {
    medical_license_number?: string;
    medical_council?: string;
    specialty?: string;
    hospital_affiliation?: string;
    years_of_experience?: number;
    submitted_at?: string;
  };
  created_at: string;
}

interface DoctorInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  specialty: string;
  hospital: string;
  medical_license: string;
  years_of_experience: number | null;
  verified_at: string;
}

interface HospitalGroup {
  hospital: string;
  doctors: DoctorInfo[];
  count: number;
}

export default function AdminPage() {
  const { userData, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'pending' | 'doctors'>('pending');
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [hospitals, setHospitals] = useState<HospitalGroup[]>([]);
  const [totalDoctors, setTotalDoctors] = useState(0);
  const [loading, setLoading] = useState(true);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const isAdmin = userData?.role === 'admin';

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (isAdmin) {
      loadPendingUsers();
    }
  }, [isAuthenticated, isAdmin]);

  useEffect(() => {
    if (activeTab === 'doctors' && hospitals.length === 0 && isAdmin) {
      loadDoctors();
    }
  }, [activeTab, isAdmin]);

  const loadPendingUsers = async () => {
    try {
      const response = await authApi.getPendingVerifications();
      setPendingUsers(response.data.pending_users || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load pending verifications');
    } finally {
      setLoading(false);
    }
  };

  const loadDoctors = async () => {
    setDoctorsLoading(true);
    try {
      const response = await careApi.getDoctorsByHospital();
      setHospitals(response.data.hospitals || []);
      setTotalDoctors(response.data.total_doctors || 0);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load doctors');
    } finally {
      setDoctorsLoading(false);
    }
  };

  const handleAction = async (userId: string, action: 'approve' | 'reject') => {
    setActionLoading(userId);
    try {
      await authApi.verifyUser(userId, {
        action,
        reason: action === 'reject' ? rejectReason[userId] || 'Verification rejected' : undefined,
      });
      setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to ${action} user`);
    } finally {
      setActionLoading(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-lg mx-auto mt-20">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-yellow-100 p-3 rounded-full">
                  <Shield className="h-8 w-8 text-yellow-600" />
                </div>
              </div>
              <CardTitle>Admin Access Required</CardTitle>
              <CardDescription>
                This page is only accessible to designated administrators.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Admin accounts are pre-configured by the system.
              </p>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Admin Panel</h1>
          </div>
          <p className="text-muted-foreground">
            Manage verifications and view registered doctors.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm mb-4 flex gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b pb-2">
          <Button
            variant={activeTab === 'pending' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('pending')}
          >
            <Clock className="mr-2 h-4 w-4" />
            Pending Verifications
            {pendingUsers.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">{pendingUsers.length}</Badge>
            )}
          </Button>
          <Button
            variant={activeTab === 'doctors' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('doctors')}
          >
            <Hospital className="mr-2 h-4 w-4" />
            Doctors by Hospital
          </Button>
        </div>

        {/* Pending Verifications Tab */}
        {activeTab === 'pending' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="bg-yellow-100 p-2 rounded-lg">
                    <Clock className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{pendingUsers.length}</p>
                    <p className="text-sm text-muted-foreground">Pending Reviews</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <Stethoscope className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {pendingUsers.filter((u) => u.role === 'doctor_pending').length}
                    </p>
                    <p className="text-sm text-muted-foreground">Doctor Requests</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-lg">
                    <UserCog className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {pendingUsers.filter((u) => u.role === 'clinician_pending').length}
                    </p>
                    <p className="text-sm text-muted-foreground">Clinician Requests</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : pendingUsers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">All Caught Up!</h3>
                  <p className="text-muted-foreground">No pending verification requests.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingUsers.map((user) => {
                  const isDoctor = user.role === 'doctor_pending';
                  const vd = user.verification_data || {};
                  return (
                    <Card key={user.id} className="overflow-hidden">
                      <div className={`h-1 ${isDoctor ? 'bg-blue-500' : 'bg-green-500'}`} />
                      <CardContent className="p-6">
                        <div className="flex flex-col md:flex-row md:items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-lg font-semibold">{user.name || 'Unknown'}</h3>
                              <Badge variant={isDoctor ? 'default' : 'secondary'}>
                                {isDoctor ? 'Doctor' : 'Clinician'}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="h-4 w-4" />{user.email}
                              </div>
                              {vd.medical_license_number && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Award className="h-4 w-4" />License: {vd.medical_license_number}
                                </div>
                              )}
                              {vd.medical_council && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Shield className="h-4 w-4" />{vd.medical_council}
                                </div>
                              )}
                              {vd.specialty && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Stethoscope className="h-4 w-4" />{vd.specialty}
                                </div>
                              )}
                              {vd.hospital_affiliation && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Building className="h-4 w-4" />{vd.hospital_affiliation}
                                </div>
                              )}
                              {vd.years_of_experience != null && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Calendar className="h-4 w-4" />{vd.years_of_experience} years
                                </div>
                              )}
                              {vd.submitted_at && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Clock className="h-4 w-4" />
                                  Submitted: {new Date(vd.submitted_at).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 min-w-[200px]">
                            <Button
                              className="bg-green-600 hover:bg-green-700"
                              disabled={actionLoading === user.id}
                              onClick={() => handleAction(user.id, 'approve')}
                            >
                              {actionLoading === user.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="mr-2 h-4 w-4" />
                              )}
                              Approve
                            </Button>
                            <Input
                              placeholder="Rejection reason (optional)"
                              value={rejectReason[user.id] || ''}
                              onChange={(e) =>
                                setRejectReason({ ...rejectReason, [user.id]: e.target.value })
                              }
                              className="text-sm"
                            />
                            <Button
                              variant="destructive"
                              disabled={actionLoading === user.id}
                              onClick={() => handleAction(user.id, 'reject')}
                            >
                              {actionLoading === user.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <XCircle className="mr-2 h-4 w-4" />
                              )}
                              Reject
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Doctors by Hospital Tab */}
        {activeTab === 'doctors' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalDoctors}</p>
                    <p className="text-sm text-muted-foreground">Total Doctors</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="bg-purple-100 p-2 rounded-lg">
                    <Hospital className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{hospitals.length}</p>
                    <p className="text-sm text-muted-foreground">Hospitals</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {doctorsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : hospitals.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Stethoscope className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">No Verified Doctors Yet</h3>
                  <p className="text-muted-foreground">
                    Approved doctors will appear here grouped by hospital.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {hospitals.map((group) => (
                  <Card key={group.hospital}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building className="h-5 w-5 text-primary" />
                          <CardTitle className="text-lg">{group.hospital}</CardTitle>
                        </div>
                        <Badge variant="outline">{group.count} doctor{group.count !== 1 ? 's' : ''}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="divide-y">
                        {group.doctors.map((doc) => (
                          <div key={doc.id} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{doc.name || 'Unnamed'}</p>
                                  <Badge variant={doc.role === 'doctor' ? 'default' : 'secondary'} className="text-xs">
                                    {doc.role === 'doctor' ? 'Doctor' : 'Clinician'}
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                                  <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />{doc.email}
                                  </span>
                                  {doc.specialty && (
                                    <span className="flex items-center gap-1">
                                      <Stethoscope className="h-3 w-3" />{doc.specialty}
                                    </span>
                                  )}
                                  {doc.medical_license && (
                                    <span className="flex items-center gap-1">
                                      <Award className="h-3 w-3" />{doc.medical_license}
                                    </span>
                                  )}
                                  {doc.years_of_experience != null && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />{doc.years_of_experience}y exp
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
