import { useEffect, useState } from 'react';
import api from '../services/api';
import { Button } from '@/components/ui/button';
import { Trash2, ExternalLink, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

// Define types for API responses
interface Application {
  id: number;
  college_id: number;
  college_name: string;
  status: string;
  application_type?: string;
  priority?: string;
  notes?: string;
  submitted_at?: string;
  decision_received_at?: string;
  created_at: string;
  updated_at: string;
}

const Applications = () => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      const response = await api.applications.get();
      setApplications(response.data || []);
    } catch (error: any) {
      console.error('Failed to load applications:', error);
      toast.error('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this application?')) return;

    setDeleting(id);
    try {
      await api.applications.delete(id);
      toast.success('Application deleted');
      loadApplications();
    } catch (error: any) {
      toast.error('Failed to delete application');
    } finally {
      setDeleting(null);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.applications.update(id, { status: newStatus });
      toast.success('Status updated');
      loadApplications();
    } catch (error: any) {
      toast.error('Failed to update status');
    }
  };

  const statusOptions = [
    'researching',
    'preparing',
    'submitted',
    'accepted',
    'rejected',
    'waitlisted'
  ];

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      researching: 'bg-muted text-muted-foreground',
      preparing: 'bg-warning/10 text-warning-foreground',
      submitted: 'bg-primary/10 text-primary',
      accepted: 'bg-success/10 text-success',
      rejected: 'bg-destructive/10 text-destructive',
      waitlisted: 'bg-warning/10 text-warning-foreground'
    };
    return colors[status] || 'bg-muted text-muted-foreground';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  return (
    <div className="p-8 min-h-screen bg-background">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">My Applications</h1>
          <p className="text-muted-foreground">Track and manage your college applications</p>
        </div>
        <Button onClick={() => navigate('/colleges')}>
          <Plus className="mr-2" size={20} />
          Add Application
        </Button>
      </div>

      {applications.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground mb-4">You haven't added any applications yet</p>
          <Button onClick={() => navigate('/colleges')}>
            Browse Colleges
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {applications.map((app) => (
            <div key={app.id} className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-foreground">{app.college_name}</h3>
                    <span className="text-sm text-muted-foreground">{app.country}</span>
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Status</label>
                      <select
                        value={app.status}
                        onChange={(e) => handleStatusChange(app.id, e.target.value)}
                        className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(app.status)}`}
                      >
                        {statusOptions.map(status => (
                          <option key={status} value={status}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {app.priority && (
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Priority</label>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          app.priority === 'reach' ? 'bg-destructive/10 text-destructive' :
                          app.priority === 'target' ? 'bg-warning/10 text-warning-foreground' :
                          'bg-success/10 text-success'
                        }`}>
                          {app.priority}
                        </span>
                      </div>
                    )}
                  </div>

                  {app.notes && (
                    <p className="text-sm text-muted-foreground mb-3">{app.notes}</p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Created {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => window.open(app.official_website, '_blank')}
                    variant="outline"
                    size="sm"
                  >
                    <ExternalLink size={16} />
                  </Button>
                  <Button
                    onClick={() => handleDelete(app.id)}
                    disabled={deleting === app.id}
                    variant="destructive"
                    size="sm"
                  >
                    {deleting === app.id ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Applications;