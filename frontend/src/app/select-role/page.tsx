'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import { auth, updateUserRoleInFirestore, getUserFromFirestore } from '@/lib/firebase';
import { Heart, Stethoscope, UserCog, Loader2, CheckCircle } from 'lucide-react';

const roles = [
  {
    id: 'patient',
    label: 'Patient',
    description: 'Access your medical documents, understand health records, and chat with the AI assistant in simple language.',
    icon: Heart,
    color: 'text-red-500',
    bgColor: 'bg-red-50 border-red-200',
    selectedBg: 'bg-red-100 border-red-500 ring-2 ring-red-500',
    note: 'Instant access — no verification needed',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    description: 'View patient documents with clinical analysis, differential diagnoses, and medical terminology. Requires verification.',
    icon: Stethoscope,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 border-blue-200',
    selectedBg: 'bg-blue-100 border-blue-500 ring-2 ring-blue-500',
    note: 'Requires medical license verification',
  },
  {
    id: 'clinician',
    label: 'Clinician',
    description: 'Access clinical decision support with evidence-based analysis and professional medical terminology. Requires verification.',
    icon: UserCog,
    color: 'text-green-500',
    bgColor: 'bg-green-50 border-green-200',
    selectedBg: 'bg-green-100 border-green-500 ring-2 ring-green-500',
    note: 'Requires medical license verification',
  },
];

export default function SelectRolePage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setUserData } = useAuthStore();
  const router = useRouter();

  const handleContinue = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');

    // Map frontend role to the actual role value
    const roleValue = selected === 'doctor' ? 'doctor_pending' : selected === 'clinician' ? 'clinician_pending' : selected;

    try {
      // Try backend first
      await authApi.updateMe({ role: selected });
      const res = await authApi.getMe();
      setUserData(res.data);

      if (selected === 'patient') {
        router.push('/dashboard');
      } else {
        router.push('/verify-role');
      }
    } catch (err: any) {
      // Backend unavailable — fallback to Firestore
      const uid = auth.currentUser?.uid;
      if (uid) {
        const updated = await updateUserRoleInFirestore(uid, roleValue);
        if (updated) {
          const userData = await getUserFromFirestore(uid);
          if (userData) setUserData(userData);
          if (selected === 'patient') {
            router.push('/dashboard');
          } else {
            router.push('/verify-role');
          }
        } else {
          setError('Failed to set role. Please try again.');
        }
      } else {
        setError('Not authenticated. Please sign in again.');
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4 overflow-hidden">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">CB</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold">Choose Your Role</h1>
          <p className="text-muted-foreground mt-2">
            Select how you&apos;ll use CareBridge. This determines your experience.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm mb-4 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {roles.map((role) => {
            const Icon = role.icon;
            const isSelected = selected === role.id;

            return (
              <Card
                key={role.id}
                className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
                  isSelected ? role.selectedBg : role.bgColor
                }`}
                onClick={() => setSelected(role.id)}
              >
                <CardHeader className="text-center pb-2">
                  <div className="flex justify-center mb-3">
                    <div className={`p-3 rounded-full ${isSelected ? 'bg-white' : 'bg-white/80'}`}>
                      <Icon className={`h-8 w-8 ${role.color}`} />
                    </div>
                  </div>
                  <CardTitle className="text-lg flex items-center justify-center gap-2">
                    {role.label}
                    {isSelected && <CheckCircle className="h-5 w-5 text-green-500" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    {role.description}
                  </p>
                  <p className="text-xs font-medium text-muted-foreground/70">
                    {role.note}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-center">
          <Button
            size="lg"
            className="min-w-[200px]"
            disabled={!selected || loading}
            onClick={handleContinue}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Setting up...
              </>
            ) : (
              'Continue'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
