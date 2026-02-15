'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/store';
import { signInWithGoogle, onAuthChange, getUserFromFirestore, createUserInFirestore } from '@/lib/firebase';
import { authApi } from '@/lib/api';
import { Heart, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setUserData, isAuthenticated } = useAuthStore();
  const router = useRouter();

  const routeByRole = (userData: any) => {
    const role = userData?.role || '';
    if (!role) {
      // No role selected yet — go to role selection
      router.push('/select-role');
    } else if (role === 'doctor_pending' || role === 'clinician_pending') {
      const verificationStatus = userData?.verification_status || '';
      if (verificationStatus === 'pending') {
        // Already submitted verification — go to dashboard with pending banner
        router.push('/dashboard');
      } else {
        // Needs to submit verification
        router.push('/verify-role');
      }
    } else {
      router.push('/dashboard');
    }
  };

  useEffect(() => {
    // Only check existing auth on mount (not on state changes from logout)
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Try backend first
          const response = await authApi.getMe();
          setUserData(response.data);
          setUser(firebaseUser);
          routeByRole(response.data);
        } catch (err) {
          // Backend unavailable — fallback to Firestore
          try {
            const userData = await getUserFromFirestore(firebaseUser.uid);
            if (userData) {
              setUserData(userData);
              setUser(firebaseUser);
              routeByRole(userData);
            }
          } catch (fsErr) {
            console.error('Failed to fetch user data:', fsErr);
          }
        }
      }
    });

    return () => unsubscribe();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const user = await signInWithGoogle();
      setUser(user);

      let userData = null;

      // Try backend first
      try {
        const response = await authApi.getMe();
        userData = response.data;
      } catch (apiErr) {
        // Backend unavailable — use Firestore directly
        userData = await getUserFromFirestore(user.uid);
        if (!userData) {
          // New user — create profile in Firestore
          userData = await createUserInFirestore(user);
        }
      }

      if (userData) {
        setUserData(userData);
        routeByRole(userData);
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled. Please try again.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection.');
      } else {
        setError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4 overflow-hidden">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Heart className="h-12 w-12 text-primary fill-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome to CareBridge</CardTitle>
          <CardDescription>
            Sign in with Google to access your healthcare documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm mb-4 flex gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <Button 
            onClick={handleGoogleSignIn} 
            className="w-full" 
            variant="outline"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing In...
              </>
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </Button>
          <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <div className="flex gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-yellow-800">
                <p className="font-medium">Medical Disclaimer</p>
                <p className="mt-1">
                  CareBridge provides document analysis only. It does not provide medical advice, diagnoses, or treatment.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
