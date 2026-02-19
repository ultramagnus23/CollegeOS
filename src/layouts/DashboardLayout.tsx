import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NotificationBadge from '../components/NotificationBadge';
import AIChatbot from '../components/AIChatbot';
import ThemeToggle from '../components/ui/ThemeToggle';
import { 
  Home, 
  School, 
  Search,
  FileText, 
  Calendar, 
  PenTool, 
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  ClipboardList,
  FolderOpen,
  Award,
  Users,
  Clock
} from 'lucide-react';

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Research', href: '/research', icon: Search },
    { name: 'Colleges', href: '/colleges', icon: School },
    { name: 'Applications', href: '/applications', icon: FileText },
    { name: 'Requirements', href: '/requirements', icon: ClipboardList },
    { name: 'Deadlines', href: '/deadlines', icon: Calendar },
    { name: 'Essays', href: '/essays', icon: PenTool },
    { name: 'Documents', href: '/documents', icon: FolderOpen },
    { name: 'Scholarships', href: '/scholarships', icon: Award },
    { name: 'Recommendations', href: '/recommendations', icon: Users },
    { name: 'Timeline', href: '/timeline', icon: Clock },
    { name: 'Settings', href: '/settings', icon: SettingsIcon },
  ];

  // Mobile bottom navigation (only show main items)
  const mobileNav = navigation.slice(0, 5);

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setSidebarOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar overlay"
        />
      )}

      {/* Sidebar - Hidden on mobile, visible on desktop */}
      <div
        className={`fixed inset-y-0 left-0 w-64 z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--color-bg-surface)', borderRight: '1px solid var(--color-border)' }}
      >
        <div className="flex flex-col h-full">
          {/* Logo header */}
          <div
            className="p-6 flex items-center justify-between"
            style={{
              borderBottom: '1px solid var(--color-border)',
              background: 'linear-gradient(135deg, #12122A 0%, #1A1A3E 100%)',
            }}
          >
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>College App OS</h1>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Welcome, {user?.full_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <NavLink
                to="/notifications"
                className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
                aria-label="Notifications"
              >
                <NotificationBadge />
              </NavLink>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-2 rounded-lg hover:bg-white/10 text-white"
                aria-label="Close sidebar"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === '/'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 text-sm font-medium ${
                    isActive ? 'nav-active' : 'nav-inactive'
                  }`
                }
                style={({ isActive }) => ({
                  background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
                  color: isActive ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                })}
              >
                <item.icon size={18} aria-hidden="true" />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </nav>

          {/* Bottom bar: theme toggle + logout */}
          <div className="p-4" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <ThemeToggle />
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2.5 w-full rounded-lg transition-all duration-150 text-sm font-medium"
              style={{ color: '#EF4444', background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <LogOut size={18} aria-hidden="true" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Top Bar */}
      <header
        className="lg:hidden fixed top-0 left-0 right-0 h-14 z-30 flex items-center justify-between px-4"
        style={{
          background: '#12122A',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-white/10 text-white"
          aria-label="Open menu"
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        <h1 style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>College App OS</h1>
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen pb-20 lg:pb-0 pt-14 lg:pt-0">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30"
        style={{ background: 'var(--color-bg-surface)', borderTop: '1px solid var(--color-border)' }}
        role="navigation"
        aria-label="Mobile navigation"
      >
        <div className="flex justify-around items-center h-16">
          {mobileNav.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className="flex flex-col items-center justify-center py-2 px-3 min-w-[64px] transition-all duration-150"
              style={({ isActive }) => ({
                color: isActive ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
              })}
            >
              <item.icon size={20} aria-hidden="true" />
              <span className="text-xs mt-1 font-medium">{item.name.split(' ')[0]}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* AI Chatbot - Floating on all dashboard pages */}
      <AIChatbot />
    </div>
  );
};

export default DashboardLayout;
