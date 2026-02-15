'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { signOutUser } from '@/lib/firebase';
import { documentsApi, healthRecordsApi, chatApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Heart, FileText, MessageSquare, Activity, Shield, Upload,
  LogOut, Menu, ChevronRight, Clock, CheckCircle, AlertTriangle, LinkIcon,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, userData, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState({
    documents: 0,
    conversations: 0,
    healthRecords: 0,
    recentDocs: [] as any[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadDashboardData();
  }, [isAuthenticated]);

  const loadDashboardData = async () => {
    try {
      const [docsRes, chatsRes, recordsRes] = await Promise.allSettled([
        documentsApi.list(1, 5),
        chatApi.list(1, 5),
        healthRecordsApi.list({ page: 1, per_page: 5 }),
      ]);

      setStats({
        documents: docsRes.status === 'fulfilled' ? docsRes.value.data.total : 0,
        conversations: chatsRes.status === 'fulfilled' ? chatsRes.value.data.length : 0,
        healthRecords: recordsRes.status === 'fulfilled' ? recordsRes.value.data.length : 0,
        recentDocs: docsRes.status === 'fulfilled' ? docsRes.value.data.documents : [],
      });
    } catch (err) {
      console.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOutUser();
    logout();
    router.push('/login');
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'ready': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'anchored': return <LinkIcon className="h-4 w-4 text-blue-500" />;
      case 'processing': return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="h-full bg-background">
      {/* Top Nav */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="h-6 w-6 text-primary fill-primary" />
            <span className="text-xl font-bold">CareBridge</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden md:block">
              {user?.email}
            </span>
            <Badge variant={
              userData?.role === 'doctor' ? 'default' :
              userData?.role === 'clinician' ? 'secondary' :
              userData?.role === 'admin' ? 'destructive' :
              userData?.role?.includes('pending') ? 'outline' :
              'secondary'
            }>
              {userData?.role === 'doctor' ? '🩺 Doctor' :
               userData?.role === 'clinician' ? '👨‍⚕️ Clinician' :
               userData?.role === 'admin' ? '🛡️ Admin' :
               userData?.role === 'doctor_pending' ? '⏳ Doctor (Pending)' :
               userData?.role === 'clinician_pending' ? '⏳ Clinician (Pending)' :
               'Patient'}
            </Badge>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Pending Verification Banner */}
        {(userData?.role === 'doctor_pending' || userData?.role === 'clinician_pending') && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-800">Verification Pending</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Your {userData?.role === 'doctor_pending' ? 'doctor' : 'clinician'} credentials are being reviewed.
                You have basic patient-level access until an admin approves your verification.
                {userData?.verification_status !== 'pending' && (
                  <> <a href="/verify-role" className="underline font-medium">Submit your credentials</a> to get verified.</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Rejection Banner */}
        {userData?.verification_status === 'rejected' && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800">Verification Rejected</h3>
              <p className="text-sm text-red-700 mt-1">
                Your role verification was not approved. Please contact support or
                <a href="/select-role" className="underline font-medium ml-1">select a different role</a>.
              </p>
            </div>
          </div>
        )}

        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            Welcome back, {user?.displayName?.split(' ')[0] || 'User'}
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your healthcare documents and health insights
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatsCard
            icon={<FileText className="h-5 w-5" />}
            title="Documents"
            value={stats.documents}
            href="/dashboard/documents"
          />
          <StatsCard
            icon={<MessageSquare className="h-5 w-5" />}
            title="Conversations"
            value={stats.conversations}
            href="/dashboard/chat"
          />
          <StatsCard
            icon={<Activity className="h-5 w-5" />}
            title="Health Records"
            value={stats.healthRecords}
            href="/dashboard/health"
          />
          <StatsCard
            icon={<Shield className="h-5 w-5" />}
            title="Blockchain Verified"
            value={stats.recentDocs.filter((d: any) => d.blockchain_tx_hash).length}
            href="/dashboard/blockchain"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Link href="/dashboard/documents/upload">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-dashed">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Upload Document</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload and encrypt medical documents
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 ml-auto text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/chat">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-dashed">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">AI Health Assistant</h3>
                  <p className="text-sm text-muted-foreground">
                    Ask questions about your documents
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 ml-auto text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/health">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-dashed">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Health Trends</h3>
                  <p className="text-sm text-muted-foreground">
                    View health data visualizations
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 ml-auto text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Documents</CardTitle>
            <CardDescription>Your latest uploaded documents</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentDocs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No documents yet. Upload your first medical document to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {stats.recentDocs.map((doc: any) => (
                  <Link
                    key={doc.id}
                    href={`/dashboard/documents/detail?id=${doc.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition"
                  >
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doc.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.document_type} &middot; {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusIcon(doc.status)}
                      <Badge variant={doc.status === 'anchored' ? 'success' : 'secondary'}>
                        {doc.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Medical Disclaimer */}
        <div className="medical-disclaimer rounded-lg mt-8">
          <strong>Medical Disclaimer:</strong> CareBridge AI provides document analysis
          for educational purposes only. Never use this platform for self-diagnosis.
          Always consult qualified healthcare professionals.
        </div>
      </div>
    </div>
  );
}

function StatsCard({
  icon,
  title,
  value,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="flex items-center gap-4 p-6">
          <div className="bg-primary/10 p-3 rounded-lg text-primary">
            {icon}
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{title}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
