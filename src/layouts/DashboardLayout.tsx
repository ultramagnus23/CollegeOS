import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Home, 
  School, 
  Search,
  FileText, 
  Calendar, 
  PenTool, 
  Settings as SettingsIcon,
  LogOut 
} from 'lucide-react';

const DashboardLayout = () => {
  const { user, logout } = useAuth();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Research', href: '/research', icon: Search },
    { name: 'Colleges', href: '/colleges', icon: School },
    { name: 'Applications', href: '/applications', icon: FileText },
    { name: 'Deadlines', href: '/deadlines', icon: Calendar },
    { name: 'Essays', href: '/essays', icon: PenTool },
    { name: 'Settings', href: '/settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-lg">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b">
            <h1 className="text-2xl font-bold text-gray-900">College App OS</h1>
            <p className="text-sm text-gray-600 mt-1">Welcome, {user?.full_name}</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                <item.icon size={20} />
                <span className="font-medium">{item.name}</span>
              </NavLink>
            ))}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t">
            <button
              onClick={logout}
              className="flex items-center space-x-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut size={20} />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 min-h-screen">
        <Outlet />
      </div>
    </div>
  );
};

export default DashboardLayout;