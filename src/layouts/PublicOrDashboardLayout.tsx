import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from './DashboardLayout';

// Colleges browsing is meant to be public (the landing page promises "no
// account needed"), but the full DashboardLayout sidebar assumes a logged-in
// user and links to pages (Applications, Essays, etc.) a guest can't use. So:
// logged-in users get the real dashboard chrome, guests get a minimal header
// and the bare page — same routes, same components, no duplicate route paths.
const GuestShell = () => (
  <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>
    <header className="border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          CollegeOS
        </Link>
        <Link
          to="/auth"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-border text-foreground text-sm font-semibold hover:bg-muted transition"
        >
          Log in
        </Link>
      </div>
    </header>
    <Outlet />
  </div>
);

const PublicOrDashboardLayout = () => {
  const { user } = useAuth();
  return user ? <DashboardLayout /> : <GuestShell />;
};

export default PublicOrDashboardLayout;
