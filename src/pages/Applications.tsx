import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { Button } from '@/components/ui/button';
import { Trash2, ExternalLink, Plus, Loader2, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmModal from '@/components/common/ConfirmModal';

// Define types for API responses
interface Application {
  id: number;
  college_id: number;
  college_name: string;
  country?: string;
  official_website?: string;
  status: string;
  application_type?: string;
  priority?: string;
  notes?: string;
  submitted_at?: string;
  decision_received_at?: string;
  created_at: string;
  updated_at: string;
}

interface CollegeResult {
  id: number;
  name: string;
  country?: string;
  location?: string;
}

const EMPTY_FORM = {
  collegeSearch: '',
  appType: 'regular' as string,
  priority: 'medium' as string,
  notes: '',
};

const Applications = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Add Application modal
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [searchResults, setSearchResults] = useState<CollegeResult[]>([]);
  const [selectedCollege, setSelectedCollege] = useState<CollegeResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadApplications();
  }, []);

  // Debounced college search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!form.collegeSearch.trim() || selectedCollege) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.colleges.search({ q: form.collegeSearch });
        const results: CollegeResult[] = (res.data || []).slice(0, 6);
        setSearchResults(results);
      } catch {
        // silently ignore search errors
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [form.collegeSearch, selectedCollege]);

  const loadApplications = async () => {
    try {
      const response = await api.applications.get();
      setApplications(response.data || []);
    } catch {
      toast.error('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    setDeleteId(null);
    try {
      await api.applications.delete(id);
      toast.success('Application deleted');
      loadApplications();
    } catch {
      toast.error('Failed to delete application');
    } finally {
      setDeleting(null);
    }
  };

  const handleSubmitAdd = async () => {
    if (!selectedCollege) {
      toast.error('Please select a college');
      return;
    }
    setSubmitting(true);
    try {
      await api.applications.create({
        college_id: selectedCollege.id,
        college_name: selectedCollege.name,
        application_type: form.appType,
        priority: form.priority,
        notes: form.notes || undefined,
      });
      toast.success('Application added');
      closeModal();
      loadApplications();
    } catch {
      toast.error('Failed to add application');
    } finally {
      setSubmitting(false);
    }
  };

  const closeModal = () => {
    setShowAdd(false);
    setForm(EMPTY_FORM);
    setSelectedCollege(null);
    setSearchResults([]);
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.applications.update(id, { status: newStatus });
      toast.success('Status updated');
      loadApplications();
    } catch {
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
      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Application"
        message="Are you sure you want to delete this application?"
        confirmLabel="Delete"
        onConfirm={() => handleDelete(deleteId!)}
        onCancel={() => setDeleteId(null)}
      />

      {/* Add Application Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6 relative">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-foreground mb-5">Add Application</h2>

            {/* College Search */}
            <div className="mb-4 relative">
              <label className="text-sm font-medium text-foreground block mb-1">
                College <span className="text-destructive">*</span>
              </label>
              {selectedCollege ? (
                <div className="flex items-center justify-between px-3 py-2 border border-border rounded-lg bg-muted/40">
                  <span className="text-sm font-medium text-foreground">{selectedCollege.name}</span>
                  <button
                    onClick={() => { setSelectedCollege(null); setForm(f => ({ ...f, collegeSearch: '' })); }}
                    className="text-muted-foreground hover:text-foreground ml-2"
                    aria-label="Clear selection"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={form.collegeSearch}
                    onChange={e => setForm(f => ({ ...f, collegeSearch: e.target.value }))}
                    placeholder="Search for a college..."
                    className="w-full pl-9 pr-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {searching && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                      {searchResults.map(college => (
                        <button
                          key={college.id}
                          onClick={() => { setSelectedCollege(college); setSearchResults([]); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors"
                        >
                          <span className="text-sm font-medium text-foreground">{college.name}</span>
                          {(college.location || college.country) && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {college.location || college.country}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Application Type */}
            <div className="mb-4">
              <label className="text-sm font-medium text-foreground block mb-1">Application Type</label>
              <select
                value={form.appType}
                onChange={e => setForm(f => ({ ...f, appType: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="early_decision">Early Decision</option>
                <option value="early_action">Early Action</option>
                <option value="regular">Regular</option>
                <option value="rolling">Rolling</option>
              </select>
            </div>

            {/* Priority */}
            <div className="mb-4">
              <label className="text-sm font-medium text-foreground block mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Notes */}
            <div className="mb-6">
              <label className="text-sm font-medium text-foreground block mb-1">Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Any additional notes..."
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={closeModal} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmitAdd} disabled={submitting || !selectedCollege}>
                {submitting && <Loader2 className="animate-spin mr-2" size={16} />}
                Add Application
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">My Applications</h1>
          <p className="text-muted-foreground">Track and manage your college applications</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="mr-2" size={20} />
          Add Application
        </Button>
      </div>

      {applications.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground mb-4">You haven't added any applications yet</p>
          <Button onClick={() => setShowAdd(true)}>
            Add Application
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
                    onClick={() => setDeleteId(app.id)}
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