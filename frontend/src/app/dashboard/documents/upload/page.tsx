'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { useAuthStore } from '@/lib/store';
import { documentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Upload, FileText, ArrowLeft, CheckCircle, Loader2, AlertCircle, X,
} from 'lucide-react';

const DOCUMENT_TYPES = [
  { value: 'lab_report', label: 'Lab Report', description: 'Blood work, urine tests, etc.' },
  { value: 'prescription', label: 'Prescription', description: 'Medication prescriptions' },
  { value: 'imaging', label: 'Imaging', description: 'X-rays, MRI, CT scans' },
  { value: 'discharge_summary', label: 'Discharge Summary', description: 'Hospital discharge documents' },
  { value: 'general', label: 'General', description: 'Other medical documents' },
];

interface UploadingFile {
  file: File;
  documentType: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  result?: any;
}

export default function UploadPage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [selectedType, setSelectedType] = useState('general');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      file,
      documentType: selectedType,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, [selectedType]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/tiff': ['.tiff', '.tif'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const uploadFile = async (index: number) => {
    const item = files[index];
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, status: 'uploading' } : f))
    );

    try {
      const response = await documentsApi.upload(item.file, item.documentType);
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: 'success', result: response.data } : f
        )
      );
    } catch (err: any) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? { ...f, status: 'error', error: err.response?.data?.detail || 'Upload failed' }
            : f
        )
      );
    }
  };

  const uploadAll = async () => {
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'pending') {
        await uploadFile(i);
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  return (
    <div className="h-full bg-background overflow-y-auto">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/documents')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Upload Documents</h1>
            <p className="text-muted-foreground">
              Documents are encrypted before upload for security
            </p>
          </div>
        </div>

        {/* Document Type Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Document Type</CardTitle>
            <CardDescription>Select the type of document you're uploading</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {DOCUMENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  className={`p-3 rounded-lg border text-left transition ${
                    selectedType === type.value
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-primary/50'
                  }`}
                >
                  <p className="font-medium text-sm">{type.label}</p>
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Drop Zone */}
        <Card className="mb-6">
          <CardContent className="p-0">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              {isDragActive ? (
                <p className="text-lg font-medium">Drop files here...</p>
              ) : (
                <>
                  <p className="text-lg font-medium">
                    Drag & drop files here, or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Supports PDF, PNG, JPEG, TIFF (max 50MB)
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* File List */}
        {files.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Files ({files.length})</CardTitle>
              <Button onClick={uploadAll} disabled={files.every((f) => f.status !== 'pending')}>
                Upload All
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {files.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(item.file.size / 1024 / 1024).toFixed(2)} MB &middot; {item.documentType}
                      </p>
                      {item.error && (
                        <p className="text-xs text-destructive mt-1">{item.error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === 'pending' && (
                        <Button size="sm" onClick={() => uploadFile(index)}>Upload</Button>
                      )}
                      {item.status === 'uploading' && (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      )}
                      {item.status === 'success' && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                      {item.status === 'error' && (
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      )}
                      {item.status !== 'uploading' && (
                        <button onClick={() => removeFile(index)}>
                          <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info */}
        <div className="medical-disclaimer rounded-lg">
          <strong>Security Note:</strong> All documents are secured with Firebase
          authentication. Document integrity is verified using SHA-256 hashes
          with blockchain-style audit trails.
        </div>
      </div>
    </div>
  );
}
