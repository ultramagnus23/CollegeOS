import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  AlertCircle,
  CheckCircle,
  BookOpen
} from 'lucide-react';
import api from '../services/api';

/* =======================
   Types
======================= */

interface Deadline {
  id: number;
  title: string;
  college_name: string;
  deadline_date: string;
  days_until: number;
}

interface DeadlinesStats {
  upcoming: number;
  this_week: number;
  completed: number;
}

interface DeadlinesResponse {
  stats: DeadlinesStats;
  upcoming: Deadline[];
}

interface Application {
  id: number;
  college_id: number;
  status: string;
}

interface TimelineAction {
  id: number;
  title: string;
  description: string;
  completed: boolean;
}

interface DashboardData {
  deadlines: DeadlinesResponse;
  applications: Application[];
  timeline: TimelineAction[];
}

/* =======================
   Component
======================= */

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async (): Promise<void> => {
    try {
      setLoading(true);

      const [deadlinesRes, applicationsRes, timelineRes] = await Promise.all([
        api.getDeadlines(),
        api.getApplications(),
        api.timeline.getMonthly()
      ]);

      setDashboardData({
        deadlines: deadlinesRes.data,
        applications: applicationsRes.data,
        timeline: timelineRes.data
      });
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  const { deadlines, applications, timeline } = dashboardData ?? {};

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Your college application overview
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Applications"
            value={applications?.length ?? 0}
            icon={<BookOpen className="w-6 h-6" />}
            color="blue"
            onClick={() => navigate('/applications')}
          />

          <StatsCard
            title="Upcoming Deadlines"
            value={deadlines?.stats?.upcoming ?? 0}
            icon={<Calendar className="w-6 h-6" />}
            color="orange"
            onClick={() => navigate('/deadlines')}
          />

          <StatsCard
            title="This Week"
            value={deadlines?.stats?.this_week ?? 0}
            icon={<AlertCircle className="w-6 h-6" />}
            color="red"
          />

          <StatsCard
            title="Completed"
            value={deadlines?.stats?.completed ?? 0}
            icon={<CheckCircle className="w-6 h-6" />}
            color="green"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Upcoming Deadlines
                </h2>
                <button
                  onClick={() => navigate('/deadlines')}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  View All
                </button>
              </div>

              {deadlines?.upcoming?.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No upcoming deadlines
                </p>
              ) : (
                <div className="space-y-3">
                  {deadlines?.upcoming?.slice(0, 5).map(deadline => (
                    <DeadlineItem key={deadline.id} deadline={deadline} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  This Month
                </h2>
                <button
                  onClick={() => navigate('/timeline')}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Full Timeline
                </button>
              </div>

              {timeline?.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No actions for this month
                </p>
              ) : (
                <div className="space-y-3">
                  {timeline?.slice(0, 5).map(action => (
                    <ActionItem key={action.id} action={action} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

/* =======================
   Helper Components
======================= */

interface StatsCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'orange' | 'red' | 'green';
  onClick?: () => void;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  color,
  onClick
}) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-green-50 text-green-600'
  };

  return (
    <div
      className="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const DeadlineItem: React.FC<{ deadline: Deadline }> = ({ deadline }) => {
  const urgencyColor =
    deadline.days_until <= 7
      ? 'text-red-600'
      : deadline.days_until <= 14
      ? 'text-orange-600'
      : 'text-gray-600';

  return (
    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
      <div className="flex-1">
        <p className="font-medium text-gray-900">{deadline.title}</p>
        <p className="text-sm text-gray-500">{deadline.college_name}</p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-medium ${urgencyColor}`}>
          {deadline.days_until} days
        </p>
        <p className="text-xs text-gray-500">{deadline.deadline_date}</p>
      </div>
    </div>
  );
};

const ActionItem: React.FC<{ action: TimelineAction }> = ({ action }) => (
  <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
    <input type="checkbox" checked={action.completed} readOnly className="mt-1" />
    <div className="flex-1">
      <p className="font-medium text-gray-900">{action.title}</p>
      <p className="text-sm text-gray-600">{action.description}</p>
    </div>
  </div>
);

export default Dashboard;
