'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { healthRecordsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Activity, Download, TrendingUp, TrendingDown,
  AlertTriangle, Loader2, RefreshCw,
} from 'lucide-react';

export default function HealthRecordsPage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [records, setRecords] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'records' | 'trends'>('records');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    // Sync first (cleans orphaned + auto-extracts new), then load data
    syncAndLoad();
  }, [isAuthenticated]);

  const syncAndLoad = async () => {
    setLoading(true);
    try {
      await healthRecordsApi.sync();
    } catch (err) {
      // Sync is best-effort, don't block render
      console.error('Health records sync failed (non-critical)');
    }
    await loadData();
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await healthRecordsApi.sync();
      await loadData();
    } catch (err) {
      console.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const loadData = async () => {
    try {
      const [recordsRes, trendsRes] = await Promise.allSettled([
        healthRecordsApi.list(),
        healthRecordsApi.getTrends(),
      ]);

      if (recordsRes.status === 'fulfilled') setRecords(recordsRes.value.data);
      if (trendsRes.status === 'fulfilled') setTrends(trendsRes.value.data);
    } catch (err) {
      console.error('Failed to load health data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await healthRecordsApi.export();
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fhir-bundle-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed');
    }
  };

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
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">Health Records</h1>
                <Badge variant="secondary" className="text-xs">Last 30 days</Badge>
              </div>
              <p className="text-muted-foreground">
                FHIR-compliant health data extracted from your documents
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleManualSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync'}
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export FHIR
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === 'records' ? 'default' : 'outline'}
            onClick={() => setActiveTab('records')}
          >
            <Activity className="h-4 w-4 mr-2" />
            Records
          </Button>
          <Button
            variant={activeTab === 'trends' ? 'default' : 'outline'}
            onClick={() => setActiveTab('trends')}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Trends
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          </div>
        ) : activeTab === 'records' ? (
          /* Records View */
          <div className="space-y-4">
            {records.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No health records yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload medical documents and extract health data to see records here
                  </p>
                </CardContent>
              </Card>
            ) : (
              records.map((record: any) => (
                <Card key={record.id}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`p-2 rounded-lg ${record.is_abnormal ? 'bg-red-100' : 'bg-green-100'}`}>
                      {record.is_abnormal ? (
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      ) : (
                        <Activity className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {record.name || record.fhir_resource?.code?.text || record.record_type}
                        </p>
                        <Badge variant={record.is_abnormal ? 'destructive' : 'success'}>
                          {record.is_abnormal ? 'Abnormal' : 'Normal'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        {record.value_numeric !== null && (
                          <span>
                            Value: <strong>{record.value_numeric}</strong> {record.value_unit}
                          </span>
                        )}
                        {record.reference_range_low !== null && record.reference_range_high !== null && (
                          <span>
                            Range: {record.reference_range_low} - {record.reference_range_high}
                          </span>
                        )}
                        {record.effective_date && (
                          <span>{new Date(record.effective_date).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary">{record.fhir_resource_type}</Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          /* Trends View */
          <div className="space-y-6">
            {trends.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No trend data available</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    More data points are needed to visualize trends
                  </p>
                </CardContent>
              </Card>
            ) : (
              trends.map((trend: any) => (
                <Card key={trend.record_type}>
                  <CardHeader>
                    <CardTitle className="text-lg">{trend.record_type}</CardTitle>
                    <CardDescription>
                      {trend.data_points.length} data points
                      {trend.unit && ` • Unit: ${trend.unit}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Simple trend visualization */}
                    <div className="flex items-end gap-1 h-32">
                      {trend.data_points.map((point: any, i: number) => {
                        const maxVal = Math.max(...trend.data_points.map((p: any) => p.value || 0));
                        const height = maxVal > 0 ? ((point.value || 0) / maxVal) * 100 : 0;
                        return (
                          <div
                            key={i}
                            className="flex-1 flex flex-col items-center gap-1"
                          >
                            <div
                              className={`w-full rounded-t ${
                                point.is_abnormal ? 'bg-red-400' : 'bg-primary'
                              }`}
                              style={{ height: `${Math.max(height, 4)}%` }}
                              title={`${point.value} ${trend.unit || ''} (${point.date})`}
                            />
                            <span className="text-[8px] text-muted-foreground truncate w-full text-center">
                              {point.date ? new Date(point.date).toLocaleDateString('en', { month: 'short' }) : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-2">
                      <span>
                        Min: {Math.min(...trend.data_points.map((p: any) => p.value || 0))} {trend.unit}
                      </span>
                      <span>
                        Max: {Math.max(...trend.data_points.map((p: any) => p.value || 0))} {trend.unit}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        <div className="medical-disclaimer rounded-lg mt-8">
          <strong>Medical Disclaimer:</strong> Health records and trends are extracted
          by AI and may contain inaccuracies. Always verify with your healthcare provider
          and original medical documents.
        </div>
      </div>
    </div>
  );
}
