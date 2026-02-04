// ============================================
// FILE: src/pages/Dashboard.tsx - MAGIC AUTOMATION DASHBOARD
// ============================================
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Link, useNavigate } from 'react-router-dom';
import AIChatbot from '../components/AIChatbot';
import ProfileStrength from '../components/chancing/ProfileStrength';
import TodaysTasks from '../components/dashboard/TodaysTasks';
import UrgentAlerts from '../components/dashboard/UrgentAlerts';
import RecommendedActions from '../components/dashboard/RecommendedActions';
import CollegeListOverview from '../components/dashboard/CollegeListOverview';
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
  Activity,
  Sparkles
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
  
  // Magic automation states
  const [recommendedActions, setRecommendedActions] = useState<any[]>([]);
  const [profileStrength, setProfileStrength] = useState(0);
  const [urgentAlerts, setUrgentAlerts] = useState<any[]>([]);
  const [collegeList, setCollegeList] = useState<any[]>([]);
  const [todaysTasks, setTodaysTasks] = useState<any[]>([]);

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
      
      // Transform applications into college list format for CollegeListOverview
      const transformedColleges = applications.map((app: any) => ({
        id: app.id,
        name: app.college_name,
        category: app.category || 'target', // reach, target, safety
        chance: app.chance || 50,
        country: app.country || 'United States',
        deadline: app.deadline,
        status: app.status
      }));
      setCollegeList(transformedColleges);
      
      // Transform deadlines into urgent alerts
      const alerts = deadlines
        .filter((d: any) => !d.is_completed)
        .slice(0, 5)
        .map((d: any) => {
          const daysRemaining = Math.ceil((new Date(d.deadline_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: d.id,
            type: 'deadline' as const,
            severity: daysRemaining <= 1 ? 'critical' as const : 
                      daysRemaining <= 3 ? 'warning' as const : 
                      daysRemaining <= 7 ? 'info' as const : 'success' as const,
            title: `${d.deadline_type} - ${d.college_name}`,
            description: `Due ${daysRemaining <= 0 ? 'today' : `in ${daysRemaining} days`}`,
            college: d.college_name,
            daysRemaining,
            action: { label: 'View', href: '/deadlines' }
          };
        });
      setUrgentAlerts(alerts);
      
      // Generate today's tasks from deadlines
      const tasks = deadlines
        .filter((d: any) => !d.is_completed)
        .slice(0, 5)
        .map((d: any) => {
          const daysRemaining = Math.ceil((new Date(d.deadline_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: d.id,
            title: d.deadline_type,
            category: 'deadline',
            priority: daysRemaining <= 1 ? 'critical' as const :
                      daysRemaining <= 3 ? 'high' as const :
                      daysRemaining <= 7 ? 'medium' as const : 'low' as const,
            dueDate: d.deadline_date,
            college: d.college_name,
            status: 'pending' as const,
            estimatedTime: 30
          };
        });
      setTodaysTasks(tasks);
      
      // Load automation data (profile strength and recommended actions)
      try {
        const userProfile = {
          gpa: user?.gpa || 3.5,
          satScore: user?.sat_score,
          actScore: user?.act_score,
          activities: [], // Would come from activities API
          grade: user?.grade || 'Grade 12',
          curriculum: user?.curriculum || 'CBSE'
        };
        
        const strengthRes = await api.automation.getProfileStrength(userProfile);
        if (strengthRes.success && strengthRes.data) {
          setProfileStrength(strengthRes.data.percentage || 0);
        }
        
        const actionsRes = await api.automation.getRecommendedActions(userProfile);
        if (actionsRes.success && actionsRes.data) {
          setRecommendedActions(actionsRes.data.map((a: any, i: number) => ({
            id: `action-${i}`,
            ...a,
            impactScore: a.impact === 'Unlocks personalized college recommendations' ? 20 :
                         a.impact === 'Better reach/target/safety classification' ? 15 : 10
          })));
        }
      } catch (automationError) {
        console.warn('Automation features not available:', automationError);
        // Fallback: generate basic recommended actions
        setRecommendedActions([
          {
            id: 'action-1',
            priority: 'high',
            category: 'profile',
            action: 'Complete your profile',
            reason: 'A complete profile unlocks personalized recommendations',
            impact: 'Unlocks personalized college recommendations',
            impactScore: 20
          },
          {
            id: 'action-2',
            priority: 'medium',
            category: 'applications',
            action: 'Add colleges to your list',
            reason: 'Build a balanced list of reach, target, and safety schools',
            impact: 'Better application strategy',
            impactScore: 15
          }
        ]);
        setProfileStrength(45); // Default estimate
      }
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Welcome Header with gradient-hero */}
      <div className="gradient-hero rounded-2xl p-8 text-white">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">Welcome back, {user?.full_name}! 👋</h1>
          <div className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Magic Mode Active</span>
          </div>
        </div>
        <p className="text-white/90 mb-6">Here's your college application journey at a glance</p>
        
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

      {/* MAGIC SECTION: Urgent Alerts Banner */}
      {urgentAlerts.length > 0 && (
        <UrgentAlerts 
          alerts={urgentAlerts}
          onAlertClick={(alertId) => navigate('/deadlines')}
        />
      )}

      {/* MAGIC SECTION: Today's Tasks + Recommended Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TodaysTasks 
          tasks={todaysTasks}
          onTaskClick={(taskId) => navigate('/deadlines')}
          onTaskComplete={(taskId) => {
            // Mark task as complete
            console.log('Complete task:', taskId);
          }}
        />
        
        <RecommendedActions 
          actions={recommendedActions}
          profileStrength={profileStrength}
          onActionClick={(action) => {
            if (action.category === 'profile') navigate('/settings');
            else if (action.category === 'essays') navigate('/essays');
            else if (action.category === 'applications') navigate('/discover');
            else if (action.category === 'deadlines') navigate('/deadlines');
          }}
        />
      </div>

      {/* MAGIC SECTION: College List Overview */}
      <CollegeListOverview 
        colleges={collegeList}
        onCollegeClick={(collegeId) => navigate(`/colleges/${collegeId}`)}
        onAddCollege={() => navigate('/discover')}
      />

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
                <div key={idx} className="flex items-center justify-between p-2 bg-indigo-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-900">{country}</span>
                  <span className="text-xs text-indigo-600 bg-white px-2 py-1 rounded">Active</span>
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
                <div key={app.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-indigo-300 transition">
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
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-6 hover:border-indigo-400 transition cursor-pointer">
            <School className="text-indigo-600 mb-3" size={32} />
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
          <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-6 hover:border-rose-400 transition cursor-pointer">
            <Calendar className="text-rose-600 mb-3" size={32} />
            <h3 className="font-bold text-gray-900 mb-1">Deadlines</h3>
            <p className="text-sm text-gray-600">Never miss a deadline</p>
          </div>
        </Link>

        <Link to="/essays">
          <div className="bg-violet-50 border-2 border-violet-200 rounded-xl p-6 hover:border-violet-400 transition cursor-pointer">
            <PenTool className="text-violet-600 mb-3" size={32} />
            <h3 className="font-bold text-gray-900 mb-1">Essays</h3>
            <p className="text-sm text-gray-600">Manage your essays</p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Dashboard;