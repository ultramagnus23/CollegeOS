import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NotificationBadge from '../components/NotificationBadge';
import AIChatbot from '../components/AIChatbot';
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
  Bell
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
    { name: 'Settings', href: '/settings', icon: SettingsIcon },
  ];

  // Mobile bottom navigation (only show main items)
  const mobileNav = navigation.slice(0, 5);

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setSidebarOpen(false)}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar overlay"
        />
      )}

      {/* Sidebar - Hidden on mobile, visible on desktop */}
      <div className={`
        fixed inset-y-0 left-0 w-64 bg-white shadow-lg z-50
        transform transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo with gradient header */}
          <div className="p-6 border-b flex items-center justify-between gradient-header">
            <div>
              <h1 className="text-2xl font-bold text-white">College App OS</h1>
              <p className="text-sm text-white/80 mt-1">Welcome, {user?.full_name}</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Notification Badge */}
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
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === '/'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <item.icon size={20} aria-hidden="true" />
                <span className="font-medium">{item.name}</span>
              </NavLink>
            ))}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t">
            <button
              onClick={handleLogout}
              className="flex items-center space-x-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut size={20} aria-hidden="true" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Top Bar with gradient */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 gradient-header shadow-sm z-30 flex items-center justify-between px-4">
        <button 
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-white/10 text-white"
          aria-label="Open menu"
        >
          <Menu size={24} aria-hidden="true" />
        </button>
        <h1 className="text-lg font-bold text-white">College App OS</h1>
        <div className="w-10" aria-hidden="true" /> {/* Spacer for centering */}
      </header>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen pb-20 lg:pb-0 pt-16 lg:pt-0">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav 
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-30"
        role="navigation"
        aria-label="Mobile navigation"
      >
        <div className="flex justify-around items-center h-16">
          {mobileNav.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2 px-3 min-w-[64px] ${
                  isActive
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`
              }
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