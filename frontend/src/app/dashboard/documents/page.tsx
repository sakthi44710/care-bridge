'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { documentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatFileSize, formatDate } from '@/lib/utils';
import {
  FileText, Upload, Search, Trash2, Download, Shield,
  ChevronLeft, ChevronRight, ArrowLeft,
} from 'lucide-react';

export default function DocumentsPage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [documents, setDocuments] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const perPage = 20;

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadDocuments();
  }, [isAuthenticated, page, typeFilter]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await documentsApi.list(page, perPage, typeFilter || undefined);
      setDocuments(response.data.documents);
      setTotal(response.data.total);
    } catch (err) {
      console.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await documentsApi.delete(id);
      loadDocuments();
    } catch (err) {
      console.error('Failed to delete document');
    }
  };

  const handleDownload = async (id: string, filename: string) => {
    try {
      const response = await documentsApi.download(id);
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download document');
    }
  };

  const totalPages = Math.ceil(total / perPage);

  const documentTypes = [
    { value: '', label: 'All Types' },
    { value: 'lab_report', label: 'Lab Report' },
    { value: 'prescription', label: 'Prescription' },
    { value: 'imaging', label: 'Imaging' },
    { value: 'general', label: 'General' },
  ];

  if (!isAuthenticated) return null;

  return (
    <div className="h-full bg-background overflow-y-auto">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Documents</h1>
              <p className="text-muted-foreground">{total} documents</p>
            </div>
          </div>
          <Link href="/dashboard/documents/upload">
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              className="pl-10"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {documentTypes.map((type) => (
              <Button
                key={type.value}
                variant={typeFilter === type.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setTypeFilter(type.value); setPage(1); }}
              >
                {type.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Documents List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No documents found</p>
              <Link href="/dashboard/documents/upload">
                <Button className="mt-4">Upload Your First Document</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {documents
              .filter((d: any) => !search || d.filename?.toLowerCase().includes(search.toLowerCase()))
              .map((doc: any) => (
                <Card key={doc.id} className="hover:shadow-sm transition">
                  <CardContent className="flex items-center gap-4 p-4">
                    <FileText className="h-10 w-10 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/dashboard/documents/detail?id=${doc.id}`}
                        className="font-medium hover:text-primary truncate block"
                      >
                        {doc.filename}
                      </Link>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span>{doc.document_type}</span>
                        <span>{formatFileSize(doc.file_size || 0)}</span>
                        <span>{formatDate(doc.created_at)}</span>
                        {doc.ocr_confidence && (
                          <span>OCR: {(doc.ocr_confidence * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {doc.blockchain_tx_hash && (
                        <Badge variant="success">
                          <Shield className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      )}
                      <Badge variant="secondary">{doc.status}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(doc.id, doc.filename)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(doc.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
