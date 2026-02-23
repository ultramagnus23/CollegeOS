import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, CheckCircle, Circle, Calendar, Loader2, List, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { DeadlineCalendar } from '@/components/DeadlineCalendar';

// Define types for API responses
interface Application {
  id: number;
  college_name: string;
  status: string;
}

interface Deadline {
  id: number;
  application_id: number;
  college_name: string;
  deadline_type: string;
  deadline_date: string;
  description?: string;
  is_completed: number;
}

interface DeadlineFormData {
  applicationId: string;
  deadlineType: string;
  deadlineDate: string;
  description: string;
}

const Deadlines = () => {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [formData, setFormData] = useState<DeadlineFormData>({
    applicationId: '',
    deadlineType: 'application',
    deadlineDate: '',
    description: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [deadlinesRes, appsRes] = await Promise.all([
        api.getDeadlines(365),
        api.getApplications()
      ]);
      setDeadlines(deadlinesRes.data || []);
      setApplications(appsRes.data || []);
    } catch (error: any) {
      toast.error('Failed to load deadlines');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.applicationId || !formData.deadlineDate) {
      toast.error('Please fill required fields');
      return;
    }

    try {
      await api.createDeadline({
        ...formData,
        applicationId: Number(formData.applicationId)
      });
      toast.success('Deadline added');
      setShowAddForm(false);
      setFormData({ applicationId: '', deadlineType: 'application', deadlineDate: '', description: '' });
      loadData();
    } catch (error: any) {
      toast.error('Failed to add deadline');
    }
  };

  const handleToggleComplete = async (id: number, isCompleted: boolean) => {
    try {
      await api.updateDeadline(id, { isCompleted: !isCompleted });
      loadData();
    } catch (error: any) {
      toast.error('Failed to update deadline');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this deadline?')) return;

    try {
      await api.deleteDeadline(id);
      toast.success('Deadline deleted');
      loadData();
    } catch (error: any) {
      toast.error('Failed to delete deadline');
    }
  };

  const getDaysUntil = (dateStr: string) => {
    const days = Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  const getUrgencyColor = (dateStr: string) => {
    const days = Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'text-red-600';
    if (days <= 7) return 'text-orange-600';
    if (days <= 30) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Deadlines</h1>
          <p className="text-muted-foreground">Stay on top of your application timeline</p>
        </div>
        <div className="flex gap-3">
          {/* View Toggle */}
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 flex items-center gap-2 ${
                viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted'
              }`}
            >
              <List size={18} />
              List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2 flex items-center gap-2 border-l ${
                viewMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted'
              }`}
            >
              <CalendarDays size={18} />
              Calendar
            </button>
          </div>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="mr-2" size={20} />
            Add Deadline
          </Button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <h3 className="text-lg font-bold mb-4">Add New Deadline</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Application *</Label>
              <select
                value={formData.applicationId}
                onChange={(e) => setFormData({ ...formData, applicationId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mt-1"
              >
                <option value="">Select application</option>
                {applications.map(app => (
                  <option key={app.id} value={app.id}>{app.college_name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Type</Label>
              <select
                value={formData.deadlineType}
                onChange={(e) => setFormData({ ...formData, deadlineType: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mt-1"
              >
                <option value="application">Application</option>
                <option value="essay">Essay</option>
                <option value="recommendation">Recommendation</option>
                <option value="transcript">Transcript</option>
                <option value="test_scores">Test Scores</option>
              </select>
            </div>

            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                value={formData.deadlineDate}
                onChange={(e) => setFormData({ ...formData, deadlineDate: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Input
                placeholder="Optional notes"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button onClick={handleAdd}>Add Deadline</Button>
            <Button onClick={() => setShowAddForm(false)} variant="outline">Cancel</Button>
          </div>
        </div>
      )}

      {/* Deadlines Display */}
      {deadlines.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground">No deadlines yet. Add one to get started!</p>
        </div>
      ) : viewMode === 'calendar' ? (
        <DeadlineCalendar deadlines={deadlines} />
      ) : (
        <div className="space-y-4">
          {deadlines.map((deadline) => (
            <div 
              key={deadline.id} 
              className={`rounded-xl border p-6 ${
                deadline.is_completed ? 'border-success/30 bg-success/5' : 'bg-card border-border'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <button
                    onClick={() => handleToggleComplete(deadline.id, deadline.is_completed)}
                    className="mt-1"
                  >
                    {deadline.is_completed ? (
                      <CheckCircle className="text-green-600" size={24} />
                    ) : (
                      <Circle className="text-muted-foreground" size={24} />
                    )}
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className={`text-lg font-bold ${deadline.is_completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {deadline.college_name}
                      </h3>
                      <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full font-medium">
                        {deadline.deadline_type}
                      </span>
                    </div>

                    {deadline.description && (
                      <p className="text-sm text-muted-foreground mb-4">{deadline.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {new Date(deadline.deadline_date).toLocaleDateString()}
                        </span>
                      </div>
                      {!deadline.is_completed && (
                        <span className={`font-medium ${getUrgencyColor(deadline.deadline_date)}`}>
                          {getDaysUntil(deadline.deadline_date)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => handleDelete(deadline.id)}
                  variant="ghost"
                  size="sm"
                >
                  <Trash2 size={16} className="text-red-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Deadlines;