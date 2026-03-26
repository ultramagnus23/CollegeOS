import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth, googleProvider } from '../lib/firebase';
import { signInWithPopup } from 'firebase/auth';

const FIREBASE_POPUP_CLOSED_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
]);

const AuthPage = () => {
  const navigate = useNavigate();
  const { user, loginWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate(user.onboarding_complete ? '/' : '/onboarding');
  }, [user, navigate]);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      await loginWithGoogle(
        firebaseUser.uid,
        firebaseUser.email ?? '',
        firebaseUser.displayName ?? ''
      );
      // navigation handled by useEffect above after user state updates
    } catch (err: any) {
      if (FIREBASE_POPUP_CLOSED_CODES.has(err.code)) {
        // User closed the popup - not an error
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-bg-primary)' }}>
      <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-md shadow-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">College App OS</h1>
          <p className="text-muted-foreground mt-2">Your global college application hub</p>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border rounded-lg bg-background hover:bg-muted transition-colors font-medium text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
            )}
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;

