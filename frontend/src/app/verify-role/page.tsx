'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import { auth, submitVerificationToFirestore, getUserFromFirestore } from '@/lib/firebase';
import { Shield, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function VerifyRolePage() {
  const { userData, setUserData } = useAuthStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    medical_license_number: '',
    medical_council: '',
    specialty: '',
    hospital_affiliation: '',
    years_of_experience: '',
  });

  const roleLabel = userData?.role === 'doctor_pending' ? 'Doctor' : 'Clinician';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!formData.medical_license_number || !formData.medical_council || !formData.specialty) {
      setError('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    try {
      // Try backend first
      await authApi.submitVerification({
        ...formData,
        years_of_experience: formData.years_of_experience
          ? parseInt(formData.years_of_experience)
          : undefined,
      });
      setSuccess(true);
      const res = await authApi.getMe();
      setUserData(res.data);
    } catch (err: any) {
      // Backend unavailable — fallback to Firestore
      const uid = auth.currentUser?.uid;
      if (uid) {
        const submitted = await submitVerificationToFirestore(uid, {
          medical_license_number: formData.medical_license_number,
          medical_council: formData.medical_council,
          specialty: formData.specialty,
          hospital_affiliation: formData.hospital_affiliation || '',
          years_of_experience: formData.years_of_experience
            ? parseInt(formData.years_of_experience)
            : null,
        });
        if (submitted) {
          setSuccess(true);
          const userData = await getUserFromFirestore(uid);
          if (userData) setUserData(userData);
        } else {
          setError('Failed to submit verification. Please try again.');
        }
      } else {
        setError(err.response?.data?.detail || 'Failed to submit verification.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="bg-green-100 p-4 rounded-full">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-2xl">Verification Submitted</CardTitle>
            <CardDescription className="mt-2">
              Your {roleLabel.toLowerCase()} credentials have been submitted for review.
              An admin will verify your information shortly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg mb-4">
              <p className="text-sm text-yellow-800">
                <strong>Status:</strong> Pending Review<br />
                You can use CareBridge with basic access while your verification is being processed.
              </p>
            </div>
            <Button onClick={() => router.push('/dashboard')} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-lg my-8">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <Shield className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">{roleLabel} Verification</CardTitle>
          <CardDescription>
            Please provide your medical credentials for verification.
            This ensures only qualified professionals access clinical features.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm mb-4 flex gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Medical License Number <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g., MCI-12345"
                value={formData.medical_license_number}
                onChange={(e) => setFormData({ ...formData, medical_license_number: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Medical Council / Board <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g., Medical Council of India, State Medical Board"
                value={formData.medical_council}
                onChange={(e) => setFormData({ ...formData, medical_council: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Specialty <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g., Cardiology, General Medicine, Radiology"
                value={formData.specialty}
                onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Hospital Affiliation
              </label>
              <Input
                placeholder="e.g., Apollo Hospital, AIIMS"
                value={formData.hospital_affiliation}
                onChange={(e) => setFormData({ ...formData, hospital_affiliation: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Years of Experience
              </label>
              <Input
                type="number"
                min="0"
                max="60"
                placeholder="e.g., 5"
                value={formData.years_of_experience}
                onChange={(e) => setFormData({ ...formData, years_of_experience: e.target.value })}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit for Verification'
              )}
            </Button>
          </form>

          <Button
            variant="ghost"
            className="w-full mt-2 text-muted-foreground"
            onClick={() => router.push('/dashboard')}
          >
            Skip for now (limited access)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
