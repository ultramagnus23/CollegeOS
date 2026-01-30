// ============================================
// FILE: src/pages/Dashboard.tsx - COMPLETE WITH ALL FEATURES
// ============================================
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Link, useNavigate } from 'react-router-dom';
import AIChatbot from '../components/AIChatbot';
import ProfileStrength from '../components/chancing/ProfileStrength';
import { 
  School, 
  FileText, 
  Calendar, 
  PenTool, 
  ArrowRight, 
  Clock, 
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Target,
  Trophy,
  BookOpen,
  Users,
  Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
// ============================================
// FILE: src/layouts/DashboardLayout.tsx - ADD CHATBOT
// ============================================
// Add this import at the top


// Add this component before the closing div
// Inside your return statement, add:
// <AIChatbot />

// Example:
/*
return (
  <div className="min-h-screen bg-gray-50">
    <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-lg">
      // ... sidebar content
    </div>
    
    <div className="ml-64 min-h-screen">
      <Outlet />
    </div>
    
    <AIChatbot />  // ADD THIS LINE
  </div>
);
*/
const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [stats, setStats] = useState({
    applications: 0,
    deadlines: 0,
    essays: 0,
    colleges: 0,
    completed: 0,
    inProgress: 0
  });
  
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<any[]>([]);
  const [recentApplications, setRecentApplications] = useState<any[]>([]);
  const [essayProgress, setEssayProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Parse user data
  const targetCountries = user?.target_countries ? JSON.parse(user.target_countries) : [];
  const intendedMajors = user?.intended_majors ? JSON.parse(user.intended_majors) : [];

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [collegesRes, applicationsRes, deadlinesRes, essaysRes] = await Promise.all([
        api.getColleges({ limit: 5 }),
        api.getApplications(),
        api.getDeadlines(30),
        api.getEssays()
      ]);

      const applications = applicationsRes.data || [];
      const deadlines = deadlinesRes.data || [];
      const essays = essaysRes.data || [];

      // Calculate statistics
      setStats({
        applications: applications.length,
        deadlines: deadlines.filter((d: any) => !d.is_completed).length,
        essays: essays.length,
        colleges: collegesRes.data?.length || 0,
        completed: applications.filter((a: any) => a.status === 'submitted' || a.status === 'accepted').length,
        inProgress: applications.filter((a: any) => a.status === 'preparing' || a.status === 'researching').length
      });

      setUpcomingDeadlines(deadlines.slice(0, 5));
      setRecentApplications(applications.slice(0, 5));
      setEssayProgress(essays.slice(0, 3));
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysUntil = (dateStr: string) => {
    const days = Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  const getProgressPercentage = () => {
    if (stats.applications === 0) return 0;
    return Math.round((stats.completed / stats.applications) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.full_name}! 👋</h1>
        <p className="text-blue-100 mb-6">Here's your college application journey at a glance</p>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={20} />
              <span className="text-sm font-medium">Applications</span>
            </div>
            <p className="text-3xl font-bold">{stats.applications}</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={20} />
              <span className="text-sm font-medium">Deadlines</span>
            </div>
            <p className="text-3xl font-bold">{stats.deadlines}</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <PenTool size={20} />
              <span className="text-sm font-medium">Essays</span>
            </div>
            <p className="text-3xl font-bold">{stats.essays}</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={20} />
              <span className="text-sm font-medium">Completed</span>
            </div>
            <p className="text-3xl font-bold">{stats.completed}</p>
          </div>
        </div>
      </div>

      {/* Progress Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overall Progress */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Overall Progress</h3>
            <Trophy className="text-yellow-500" size={24} />
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Completion</span>
                <span className="font-medium">{getProgressPercentage()}%</span>
              </div>
              <Progress value={getProgressPercentage()} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                <p className="text-xs text-gray-600">Completed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600">{stats.inProgress}</p>
                <p className="text-xs text-gray-600">In Progress</p>
              </div>
            </div>
          </div>
        </div>

        {/* Target Countries */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Target Countries</h3>
            <Target className="text-blue-500" size={24} />
          </div>
          <div className="space-y-2">
            {targetCountries.length > 0 ? (
              targetCountries.map((country: string, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-900">{country}</span>
                  <span className="text-xs text-blue-600 bg-white px-2 py-1 rounded">Active</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No target countries set</p>
            )}
          </div>
        </div>

        {/* Intended Majors */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Intended Majors</h3>
            <BookOpen className="text-purple-500" size={24} />
          </div>
          <div className="space-y-2">
            {intendedMajors.length > 0 ? (
              intendedMajors.map((major: string, idx: number) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-900">{major}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No majors selected</p>
            )}
          </div>
        </div>
      </div>

      {/* Profile Strength Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Strength Card */}
        <div className="lg:col-span-2">
          <ProfileStrength />
        </div>
        
        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-bold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link to="/activities" className="block">
              <Button variant="outline" className="w-full justify-start">
                <Activity className="mr-2 h-4 w-4" />
                Manage Activities
              </Button>
            </Link>
            <Link to="/colleges" className="block">
              <Button variant="outline" className="w-full justify-start">
                <School className="mr-2 h-4 w-4" />
                Explore Colleges
              </Button>
            </Link>
            <Link to="/essays" className="block">
              <Button variant="outline" className="w-full justify-start">
                <PenTool className="mr-2 h-4 w-4" />
                Work on Essays
              </Button>
            </Link>
            <Link to="/deadlines" className="block">
              <Button variant="outline" className="w-full justify-start">
                <Calendar className="mr-2 h-4 w-4" />
                Check Deadlines
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Deadlines */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Clock className="text-red-600" size={24} />
              Upcoming Deadlines
            </h2>
            <Link to="/deadlines">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-2" size={16} />
              </Button>
            </Link>
          </div>
          
          {upcomingDeadlines.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="mx-auto text-gray-400 mb-3" size={48} />
              <p className="text-gray-500 mb-4">No upcoming deadlines</p>
              <Link to="/deadlines">
                <Button size="sm">Add Deadline</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingDeadlines.map((deadline: any) => {
                const daysUntil = getDaysUntil(deadline.deadline_date);
                const isUrgent = daysUntil === 'Today' || daysUntil === 'Tomorrow' || daysUntil === 'Overdue';
                
                return (
                  <div
                    key={deadline.id}
                    className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                      isUrgent ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{deadline.college_name}</p>
                      <p className="text-sm text-gray-600">{deadline.deadline_type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isUrgent && <AlertCircle className="text-red-600" size={16} />}
                      <span className={`text-sm font-medium ${isUrgent ? 'text-red-600' : 'text-gray-600'}`}>
                        {daysUntil}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Applications */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="text-blue-600" size={24} />
              Recent Applications
            </h2>
            <Link to="/applications">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-2" size={16} />
              </Button>
            </Link>
          </div>
          
          {recentApplications.length === 0 ? (
            <div className="text-center py-8">
              <School className="mx-auto text-gray-400 mb-3" size={48} />
              <p className="text-gray-500 mb-4">No applications yet</p>
              <Link to="/discover">
                <Button size="sm">Browse Colleges</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentApplications.map((app: any) => (
                <div key={app.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{app.college_name}</p>
                    <p className="text-sm text-gray-600">{app.country}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    app.status === 'submitted' ? 'bg-green-100 text-green-700' :
                    app.status === 'preparing' ? 'bg-yellow-100 text-yellow-700' :
                    app.status === 'accepted' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {app.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Essay Progress */}
      {essayProgress.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <PenTool className="text-green-600" size={24} />
              Essay Progress
            </h2>
            <Link to="/essays">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-2" size={16} />
              </Button>
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {essayProgress.map((essay: any) => (
              <div key={essay.id} className="p-4 border border-gray-200 rounded-lg">
                <p className="font-medium text-gray-900 mb-2">{essay.college_name}</p>
                <p className="text-sm text-gray-600 mb-3">{essay.essay_type}</p>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    essay.status === 'final' ? 'bg-green-500' :
                    essay.status === 'draft_complete' ? 'bg-yellow-500' :
                    essay.status === 'in_progress' ? 'bg-blue-500' :
                    'bg-gray-300'
                  }`} />
                  <span className="text-xs text-gray-600 capitalize">
                    {essay.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Link to="/discover">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 hover:border-blue-400 transition cursor-pointer">
            <School className="text-blue-600 mb-3" size={32} />
            <h3 className="font-bold text-gray-900 mb-1">Discover Colleges</h3>
            <p className="text-sm text-gray-600">Browse and research universities</p>
          </div>
        </Link>

        <Link to="/applications">
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 hover:border-green-400 transition cursor-pointer">
            <FileText className="text-green-600 mb-3" size={32} />
            <h3 className="font-bold text-gray-900 mb-1">My Applications</h3>
            <p className="text-sm text-gray-600">Track application progress</p>
          </div>
        </Link>

        <Link to="/deadlines">
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 hover:border-red-400 transition cursor-pointer">
            <Calendar className="text-red-600 mb-3" size={32} />
            <h3 className="font-bold text-gray-900 mb-1">Deadlines</h3>
            <p className="text-sm text-gray-600">Never miss a deadline</p>
          </div>
        </Link>

        <Link to="/essays">
          <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-6 hover:border-purple-400 transition cursor-pointer">
            <PenTool className="text-purple-600 mb-3" size={32} />
            <h3 className="font-bold text-gray-900 mb-1">Essays</h3>
            <p className="text-sm text-gray-600">Manage your essays</p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;