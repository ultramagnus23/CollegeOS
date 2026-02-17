import { useEffect, useState } from 'react';
import api from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, ExternalLink, Trash2, Loader2, PenTool, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { WordCountTracker } from '@/components/WordCountTracker';

// Define types for API responses
interface Application {
  id: number;
  college_name: string;
  status: string;
}

interface Essay {
  id: number;
  application_id: number;
  college_name: string;
  essay_type: string;
  prompt: string;
  word_limit?: number;
  google_drive_link?: string;
  status: string;
  notes?: string;
}

interface EssayFormData {
  applicationId: string;
  essayType: string;
  prompt: string;
  wordLimit: string;
  googleDriveLink: string;
  notes: string;
}

const Essays = () => {
  const [essays, setEssays] = useState<Essay[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedEssay, setExpandedEssay] = useState<number | null>(null);
  const [essayPreview, setEssayPreview] = useState<{ [key: number]: string }>({});
  const [formData, setFormData] = useState<EssayFormData>({
    applicationId: '',
    essayType: 'personal_statement',
    prompt: '',
    wordLimit: '',
    googleDriveLink: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [essaysRes, appsRes] = await Promise.all([
        api.essays.getAll<{ data: any[] }>(),
        api.applications.getAll<{ data: any[] }>()
      ]);
      setEssays(essaysRes.data || []);
      setApplications(appsRes.data || []);
    } catch (error: any) {
      toast.error('Failed to load essays');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.applicationId || !formData.prompt) {
      toast.error('Please fill required fields');
      return;
    }

    try {
      await api.essays.create({
        ...formData,
        applicationId: Number(formData.applicationId),
        wordLimit: formData.wordLimit ? Number(formData.wordLimit) : null
      });
      toast.success('Essay added');
      setShowAddForm(false);
      setFormData({
        applicationId: '',
        essayType: 'personal_statement',
        prompt: '',
        wordLimit: '',
        googleDriveLink: '',
        notes: ''
      });
      loadData();
    } catch (error: any) {
      toast.error('Failed to add essay');
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.essays.update(id, { status: newStatus });
      toast.success('Status updated');
      loadData();
    } catch (error: any) {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this essay?')) return;

    try {
      await api.essays.delete(id);
      toast.success('Essay deleted');
      loadData();
    } catch (error: any) {
      toast.error('Failed to delete essay');
    }
  };

  const statusOptions = [
    { value: 'not_started', label: 'Not Started', color: 'bg-gray-100 text-gray-700' },
    { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-700' },
    { value: 'draft_complete', label: 'Draft Complete', color: 'bg-blue-100 text-blue-700' },
    { value: 'final', label: 'Final', color: 'bg-green-100 text-green-700' }
  ];

  const getStatusColor = (status: string) => {
    return statusOptions.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Essays</h1>
          <p className="text-gray-600">Track your essays and link to Google Docs</p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="mr-2" size={20} />
          Add Essay
        </Button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h3 className="text-lg font-bold mb-4">Add New Essay</h3>
          <div className="space-y-4">
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
                <Label>Essay Type</Label>
                <select
                  value={formData.essayType}
                  onChange={(e) => setFormData({ ...formData, essayType: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg mt-1"
                >
                  <option value="personal_statement">Personal Statement</option>
                  <option value="supplemental">Supplemental Essay</option>
                  <option value="why_us">Why Us Essay</option>
                </select>
              </div>
            </div>

            <div>
              <Label>Essay Prompt *</Label>
              <Textarea
                placeholder="Enter the essay prompt..."
                value={formData.prompt}
                onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                className="mt-1"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Word Limit</Label>
                <Input
                  type="number"
                  placeholder="e.g., 650"
                  value={formData.wordLimit}
                  onChange={(e) => setFormData({ ...formData, wordLimit: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Google Drive Link</Label>
                <Input
                  type="url"
                  placeholder="https://docs.google.com/..."
                  value={formData.googleDriveLink}
                  onChange={(e) => setFormData({ ...formData, googleDriveLink: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="mt-1"
                rows={2}
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button onClick={handleAdd}>Add Essay</Button>
            <Button onClick={() => setShowAddForm(false)} variant="outline">Cancel</Button>
          </div>
        </div>
      )}

      {/* Essays List */}
      {essays.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <PenTool className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-500 mb-4">No essays yet. Add one to get started!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {essays.map((essay) => (
            <div key={essay.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{essay.college_name}</h3>
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                      {essay.essay_type.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="mb-3">
                    <label className="text-xs text-gray-500 block mb-1">Status</label>
                    <select
                      value={essay.status}
                      onChange={(e) => handleStatusChange(essay.id, e.target.value)}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(essay.status)}`}
                    >
                      {statusOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <Button
                  onClick={() => handleDelete(essay.id)}
                  variant="ghost"
                  size="sm"
                >
                  <Trash2 size={16} className="text-red-600" />
                </Button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700 italic">{essay.prompt}</p>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  {essay.word_limit && (
                    <span>Word Limit: {essay.word_limit}</span>
                  )}
                  {essay.last_edited_at && (
                    <span>Last edited: {new Date(essay.last_edited_at).toLocaleDateString()}</span>
                  )}
                </div>

                {essay.google_drive_link && (
                  <Button
                    onClick={() => window.open(essay.google_drive_link, '_blank')}
                    variant="outline"
                    size="sm"
                  >
                    <ExternalLink className="mr-2" size={16} />
                    Open in Google Docs
                  </Button>
                )}
              </div>

              {essay.notes && (
                <p className="text-sm text-gray-600 mt-4 p-3 bg-yellow-50 rounded-lg">
                  📝 {essay.notes}
                </p>
              )}

              {/* Word Count Checker */}
              <div className="mt-4 border-t pt-4">
                <Button
                  onClick={() => setExpandedEssay(expandedEssay === essay.id ? null : essay.id)}
                  variant="outline"
                  size="sm"
                  className="mb-3"
                >
                  <FileText className="mr-2" size={16} />
                  {expandedEssay === essay.id ? 'Hide' : 'Show'} Word Count Checker
                </Button>
                
                {expandedEssay === essay.id && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm text-gray-600">Paste your essay to check word count</Label>
                      <Textarea
                        placeholder="Paste your essay here to check if it meets the word limit..."
                        value={essayPreview[essay.id] || ''}
                        onChange={(e) => setEssayPreview({ ...essayPreview, [essay.id]: e.target.value })}
                        className="mt-1 min-h-[120px]"
                        rows={6}
                      />
                    </div>
                    
                    {essayPreview[essay.id] && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <WordCountTracker
                          text={essayPreview[essay.id]}
                          wordLimit={essay.word_limit || undefined}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Essays;