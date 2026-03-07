import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ERROR_MAP: Record<string, string> = {
  'Invalid credentials': 'Incorrect email or password. Please try again.',
  'User not found': 'No account found with that email address.',
  'Email already exists': 'An account with this email already exists. Try logging in.',
  'Network error': 'Unable to connect. Please check your internet connection.',
};

const friendlyError = (msg: string): string =>
  ERROR_MAP[msg] || msg || 'Something went wrong. Please try again.';

const AuthPage = () => {
  const navigate = useNavigate();
  const { user, login, register } = useAuth();
  const [view, setView] = useState<'login' | 'register'>('login');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    country: 'India'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Bug fix 1: useEffect-based redirect instead of render-time navigate
  useEffect(() => {
    if (user) navigate(user.onboarding_complete ? '/' : '/onboarding');
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Bug fix 4: password validation for register
    if (view === 'register') {
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      if (view === 'login') {
        await login(formData.email, formData.password);
        // Bug fix 2: login navigates to '/'
        navigate('/');
      } else {
        await register(formData.email, formData.password, formData.fullName, formData.country);
        // Bug fix 2: register navigates to '/onboarding'
        navigate('/onboarding');
      }
    } catch (err: any) {
      // Bug fix 5: user-friendly error messages
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background: "var(--color-bg-primary)"}}>
      <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-md shadow-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">College App OS</h1>
          <p className="text-muted-foreground mt-2">Your global college application hub</p>
        </div>

        {/* Bug fix 3: proper <form> wrapping for Enter key submission */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {view === 'register' && (
            <>
              <div>
                <Label>Full Name</Label>
                <Input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label>Country</Label>
                <select
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg"
                >
                  <option value="India">India</option>
                  <option value="USA">USA</option>
                  <option value="UK">UK</option>
                  <option value="Australia">Australia</option>
                </select>
              </div>
            </>
          )}

          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>

          {/* Bug fix 4: confirm password field for registration */}
          {view === 'register' && (
            <div>
              <Label>Confirm Password</Label>
              <Input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
              />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? 'Processing...' : view === 'login' ? 'Login' : 'Register'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { setView(view === 'login' ? 'register' : 'login'); setError(''); }}
            className="text-primary hover:text-primary/80 text-sm"
          >
            {view === 'login' ? "Don't have an account? Register" : 'Already have an account? Login'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;