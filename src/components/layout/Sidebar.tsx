import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Search, 
  ClipboardList, 
  Calendar, 
  FileText, 
  Settings,
  GraduationCap,
  LogOut,
  ChevronLeft,
  Menu,
  BookOpen,
  Building2,
  Bell,
  Award,
  Users,
  FileCheck,
  Clock,
  Compass
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const navSections = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard,  path: '/' },
      { id: 'discover',     label: 'Discover',     icon: Compass,          path: '/discover' },
    ]
  },
  {
    label: 'Colleges',
    items: [
      { id: 'colleges',     label: 'Colleges',     icon: Building2,        path: '/colleges' },
      { id: 'research',     label: 'Research',     icon: Search,           path: '/research' },
      { id: 'search',       label: 'AI Search',    icon: Search,           path: '/search' },
    ]
  },
  {
    label: 'Applications',
    items: [
      { id: 'applications', label: 'Applications', icon: ClipboardList,    path: '/applications' },
      { id: 'requirements', label: 'Requirements', icon: FileCheck,        path: '/requirements' },
      { id: 'deadlines',    label: 'Deadlines',    icon: Clock,            path: '/deadlines' },
      { id: 'essays',       label: 'Essays',       icon: FileText,         path: '/essays' },
    ]
  },
  {
    label: 'Profile',
    items: [
      { id: 'activities',   label: 'Activities',   icon: BookOpen,         path: '/activities' },
      { id: 'documents',    label: 'Documents',    icon: Award,            path: '/documents' },
      { id: 'scholarships', label: 'Scholarships', icon: Award,            path: '/scholarships' },
      { id: 'recommendations', label: 'Recommenders', icon: Users,         path: '/recommendations' },
      { id: 'timeline',     label: 'Timeline',     icon: Calendar,         path: '/timeline' },
    ]
  },
];

interface SidebarProps {
  userName?: string;
}

export function Sidebar({ userName = 'Student' }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-card border shadow-soft"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
        'max-lg:translate-x-[-100%] lg:translate-x-0',
        !collapsed && 'max-lg:translate-x-0'
      )}>
        {/* Header */}
        <div className={cn(
          'flex items-center gap-3 p-4 border-b border-sidebar-border',
          collapsed && 'justify-center'
        )}>
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-sidebar-foreground truncate">CollegeOS</h1>
              <p className="text-xs text-sidebar-foreground/60 truncate">Application Hub</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden lg:flex text-sidebar-foreground/60 hover:text-sidebar-foreground"
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronLeft className={cn(
              'w-4 h-4 transition-transform',
              collapsed && 'rotate-180'
            )} />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label} className="mb-4">
              {!collapsed && (
                <p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-3 mb-1">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path ||
                    (item.path !== '/' && location.pathname.startsWith(item.path));
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.path)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                        collapsed && 'justify-center px-2'
                      )}
                    >
                      <Icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-sidebar-primary')} />
                      {!collapsed && <span>{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={cn(
          'p-3 border-t border-sidebar-border space-y-1',
          collapsed && 'p-2'
        )}>
          <button
            onClick={() => navigate('/settings')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              collapsed && 'justify-center px-2'
            )}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Settings</span>}
          </button>

          {!collapsed && (
            <div className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-sidebar-foreground/60 truncate">{userName}</span>
              <Button variant="ghost" size="icon-sm" className="text-sidebar-foreground/60">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Overlay for mobile */}
      {!collapsed && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setCollapsed(true)}
        />
      )}
    </>
  );
}
