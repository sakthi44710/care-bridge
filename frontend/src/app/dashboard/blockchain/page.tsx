'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { blockchainApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Shield, Link as LinkIcon, Clock, CheckCircle,
  Eye, UserPlus, UserMinus, Loader2,
} from 'lucide-react';

export default function BlockchainPage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [auditTrail, setAuditTrail] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadAuditTrail();
  }, [isAuthenticated]);

  const loadAuditTrail = async () => {
    try {
      const response = await blockchainApi.getAudit();
      setAuditTrail(response.data);
    } catch (err) {
      console.error('Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  };

  const eventIcon = (eventType: string) => {
    switch (eventType) {
      case 'document_anchored': return <LinkIcon className="h-4 w-4 text-blue-500" />;
      case 'document_verified': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'access_granted': return <UserPlus className="h-4 w-4 text-purple-500" />;
      case 'access_revoked': return <UserMinus className="h-4 w-4 text-red-500" />;
      default: return <Eye className="h-4 w-4 text-gray-500" />;
    }
  };

  const eventLabel = (eventType: string) => {
    switch (eventType) {
      case 'document_anchored': return 'Document Anchored';
      case 'document_verified': return 'Integrity Verified';
      case 'access_granted': return 'Access Granted';
      case 'access_revoked': return 'Access Revoked';
      default: return eventType;
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="h-full bg-background overflow-y-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Blockchain Audit Trail
            </h1>
            <p className="text-muted-foreground">
              Immutable record of all document operations
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          </div>
        ) : auditTrail.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No blockchain events recorded yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload and anchor documents to see blockchain audit entries
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {auditTrail.map((audit: any) => (
              <Card key={audit.id}>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="bg-muted p-2 rounded-lg mt-1">
                    {eventIcon(audit.event_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{eventLabel(audit.event_type)}</p>
                      <Badge variant="secondary">
                        Block #{audit.block_number}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p className="break-all">
                        <span className="font-medium">TX:</span>{' '}
                        <code className="text-xs bg-muted px-1 rounded">
                          {audit.tx_hash}
                        </code>
                      </p>
                      {audit.payload?.document_id && (
                        <p className="mt-1">
                          <span className="font-medium">Document:</span>{' '}
                          {audit.payload.document_id}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(audit.created_at).toLocaleString()}
                    </div>
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
