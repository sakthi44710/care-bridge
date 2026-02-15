'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { documentsApi, blockchainApi, healthRecordsApi, careApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatFileSize, formatDateTime } from '@/lib/utils';
import {
  ArrowLeft, Download, Shield, FileText, Clock, CheckCircle,
  Link as LinkIcon, Activity, Loader2, Eye,
} from 'lucide-react';

export default function DocumentDetailPage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentId = searchParams.get('id');

  const [document, setDocument] = useState<any>(null);
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (documentId) loadDocument();
  }, [isAuthenticated, documentId]);

  const loadDocument = async () => {
    if (!documentId) return;
    try {
      const response = await documentsApi.get(documentId);
      setDocument(response.data);
      // Get preview URL
      try {
        const urlRes = await careApi.getDocumentUrl(documentId);
        setPreviewUrl(urlRes.data.download_url);
      } catch { /* no preview available */ }
    } catch (err) {
      console.error('Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!documentId) return;
    setVerifying(true);
    try {
      const response = await documentsApi.verify(documentId);
      setVerification(response.data);
    } catch (err) {
      console.error('Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleAnchor = async () => {
    if (!documentId) return;
    try {
      await blockchainApi.anchor(documentId);
      loadDocument();
    } catch (err) {
      console.error('Anchoring failed');
    }
  };

  const handleExtract = async () => {
    if (!documentId) return;
    setExtracting(true);
    try {
      await healthRecordsApi.extract(documentId);
      alert('Health records extracted successfully!');
    } catch (err) {
      console.error('Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const handleDownload = async () => {
    if (!documentId) return;
    try {
      const response = await documentsApi.download(documentId);
      const url = URL.createObjectURL(response.data);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed');
    }
  };

  if (!isAuthenticated || loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!documentId || !document) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Document not found</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-background overflow-y-auto">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/documents')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold truncate">{document.filename}</h1>
            <p className="text-muted-foreground">Document Details</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button variant="outline" onClick={handleVerify} disabled={verifying}>
              <Shield className="h-4 w-4 mr-2" />
              {verifying ? 'Verifying...' : 'Verify'}
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Document Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Filename" value={document.filename} />
              <InfoRow label="Type" value={document.document_type} />
              <InfoRow label="MIME Type" value={document.mime_type} />
              <InfoRow label="Size" value={formatFileSize(document.file_size || 0)} />
              <InfoRow label="Status">
                <Badge variant={document.status === 'anchored' ? 'success' : 'secondary'}>
                  {document.status}
                </Badge>
              </InfoRow>
              <InfoRow label="Uploaded" value={formatDateTime(document.created_at)} />
              {document.ocr_confidence && (
                <InfoRow
                  label="OCR Confidence"
                  value={`${(document.ocr_confidence * 100).toFixed(1)}%`}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Blockchain Integrity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Content Hash">
                <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                  {document.content_hash || 'N/A'}
                </code>
              </InfoRow>
              {document.blockchain_tx_hash ? (
                <>
                  <InfoRow label="TX Hash">
                    <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                      {document.blockchain_tx_hash}
                    </code>
                  </InfoRow>
                  <InfoRow
                    label="Anchored At"
                    value={document.blockchain_anchored_at ? formatDateTime(document.blockchain_anchored_at) : 'N/A'}
                  />
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">Not anchored yet</p>
                  <Button onClick={handleAnchor} size="sm">
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Anchor to Blockchain
                  </Button>
                </div>
              )}
              {verification && (
                <div className={`p-3 rounded-lg ${verification.is_valid ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center gap-2">
                    {verification.is_valid ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <Shield className="h-5 w-5 text-red-500" />
                    )}
                    <span className="font-medium">
                      {verification.is_valid ? 'Integrity Verified' : 'Integrity Check Failed'}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Document Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {previewUrl ? (
                document.mime_type === 'application/pdf' ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-[500px] rounded border"
                    title={document.filename}
                  />
                ) : document.mime_type?.startsWith('image/') ? (
                  <img
                    src={previewUrl}
                    alt={document.filename}
                    className="max-w-full rounded border max-h-[500px] object-contain mx-auto"
                  />
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">Preview not available for this file type.</p>
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                      <Button><Download className="mr-2 h-4 w-4" /> Download to View</Button>
                    </a>
                  </div>
                )
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-2" />
                  <p className="text-sm">Preview not available</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Health Data Extraction
              </CardTitle>
              <CardDescription>
                Extract structured health records from this document using AI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleExtract} disabled={extracting}>
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Activity className="h-4 w-4 mr-2" />
                    Extract Health Records
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                AI will analyze the document and extract lab results, medications, and conditions.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="medical-disclaimer rounded-lg mt-8">
          <strong>Medical Disclaimer:</strong> AI-extracted health data is for informational
          purposes only. Always verify with your healthcare provider.
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      {children || <span className="text-sm font-medium text-right">{value}</span>}
    </div>
  );
}
