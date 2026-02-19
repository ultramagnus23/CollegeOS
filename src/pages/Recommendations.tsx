import { useEffect, useState } from 'react';
import api from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  Trash2, 
  Loader2, 
  Users,
  Mail,
  Phone,
  Clock,
  CheckCircle,
  AlertTriangle,
  Send,
  Copy,
  School,
  Briefcase,
  UserCheck
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Recommender {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  type: string;
  relationship?: string;
  subject?: string;
  institution?: string;
  years_known?: number;
  notes?: string;
  letters_submitted?: number;
  total_requests?: number;
}

interface RecommendationRequest {
  id: number;
  recommender_id: number;
  recommender_name: string;
  recommender_email?: string;
  recommender_type: string;
  college_id?: number;
  college_name?: string;
  application_system?: string;
  status: string;
  request_date?: string;
  deadline?: string;
  submitted_date?: string;
  reminder_sent?: number;
  thank_you_sent?: number;
  notes?: string;
}

interface Summary {
  total_requests: number;
  not_requested: number;
  requested: number;
  in_progress: number;
  submitted: number;
  declined: number;
  overdue: number;
  needs_thank_you: number;
  overdueRequests: RecommendationRequest[];
  pendingReminders: RecommendationRequest[];
}

const RECOMMENDER_TYPES = {
  teacher: { label: 'Teacher', icon: School, color: 'bg-blue-100 text-blue-700' },
  counselor: { label: 'Counselor', icon: UserCheck, color: 'bg-green-100 text-green-700' },
  mentor: { label: 'Mentor', icon: Users, color: 'bg-purple-100 text-purple-700' },
  employer: { label: 'Employer', icon: Briefcase, color: 'bg-orange-100 text-orange-700' },
  other: { label: 'Other', icon: Users, color: 'bg-gray-100 text-gray-700' },
};

const STATUS_COLORS: Record<string, string> = {
  not_requested: 'bg-gray-100 text-gray-700',
  requested: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  submitted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
};

const Recommendations = () => {
  const [recommenders, setRecommenders] = useState<Recommender[]>([]);
  const [requests, setRequests] = useState<RecommendationRequest[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'recommenders' | 'requests' | 'templates'>('recommenders');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [selectedRecommender, setSelectedRecommender] = useState<Recommender | null>(null);
  const [emailTemplate, setEmailTemplate] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    type: 'teacher',
    relationship: '',
    subject: '',
    institution: '',
    yearsKnown: '',
    notes: '',
  });
  
  const [requestFormData, setRequestFormData] = useState({
    collegeName: '',
    applicationSystem: 'CommonApp',
    deadline: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [recommendersRes, requestsRes, summaryRes] = await Promise.all([
        api.recommenders.getAll(),
        api.recommenders.requests.getAll(),
        api.recommenders.getSummary(),
      ]) as [any, any, any];
      
      setRecommenders(recommendersRes.data || []);
      setRequests(requestsRes.data || []);
      setSummary(summaryRes.data || null);
    } catch (error: any) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load recommendations data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecommender = async () => {
    if (!formData.name || !formData.type) {
      toast.error('Please fill required fields');
      return;
    }

    try {
      await api.recommenders.create({
        ...formData,
        yearsKnown: formData.yearsKnown ? parseInt(formData.yearsKnown) : undefined,
      });
      toast.success('Recommender added');
      setShowAddForm(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        type: 'teacher',
        relationship: '',
        subject: '',
        institution: '',
        yearsKnown: '',
        notes: '',
      });
      loadData();
    } catch (error: any) {
      toast.error('Failed to add recommender');
    }
  };

  const handleDeleteRecommender = async (id: number) => {
    if (!confirm('Delete this recommender and all their requests?')) return;

    try {
      await api.recommenders.delete(id);
      toast.success('Recommender deleted');
      loadData();
    } catch (error: any) {
      toast.error('Failed to delete recommender');
    }
  };

  const handleCreateRequest = async () => {
    if (!selectedRecommender) return;

    try {
      await api.recommenders.requests.create(selectedRecommender.id, {
        collegeName: requestFormData.collegeName,
        applicationSystem: requestFormData.applicationSystem,
        deadline: requestFormData.deadline || undefined,
        notes: requestFormData.notes,
        status: 'not_requested',
      });
      toast.success('Request created');
      setShowRequestForm(false);
      setSelectedRecommender(null);
      setRequestFormData({
        collegeName: '',
        applicationSystem: 'CommonApp',
        deadline: '',
        notes: '',
      });
      loadData();
    } catch (error: any) {
      toast.error('Failed to create request');
    }
  };

  const handleUpdateRequestStatus = async (id: number, status: string) => {
    try {
      await api.recommenders.requests.update(id, { status });
      toast.success('Status updated');
      loadData();
    } catch (error: any) {
      toast.error('Failed to update status');
    }
  };

  const handleGenerateEmail = async (type: 'request' | 'reminder' | 'thank_you', request?: RecommendationRequest) => {
    try {
      const recommender = request 
        ? recommenders.find(r => r.id === request.recommender_id)
        : selectedRecommender;
        
      const res = await api.recommenders.generateEmailTemplate(type, {
        recommenderName: recommender?.name || 'Teacher',
        collegeName: request?.college_name || requestFormData.collegeName || 'the university',
        subject: recommender?.subject || 'the subject',
        deadline: request?.deadline || requestFormData.deadline || 'soon',
      }) as any;
      
      setEmailTemplate(res.data?.template || '');
      setActiveTab('templates');
    } catch (error: any) {
      toast.error('Failed to generate template');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(emailTemplate);
    toast.success('Copied to clipboard');
  };

  const getDaysUntilDeadline = (dateStr: string) => {
    const days = Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Recommendation Manager</h1>
        <p className="text-gray-600">Track and manage your recommendation letters</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">{recommenders.length}</p>
              <p className="text-sm text-gray-600">Recommenders</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="text-yellow-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.requested || 0}</p>
              <p className="text-sm text-gray-600">Pending</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.submitted || 0}</p>
              <p className="text-sm text-gray-600">Submitted</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="text-red-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.overdue || 0}</p>
              <p className="text-sm text-gray-600">Overdue</p>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {summary?.overdueRequests && summary.overdueRequests.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-red-600" size={20} />
            <h3 className="font-semibold text-red-800">Overdue Recommendations</h3>
          </div>
          <div className="space-y-2">
            {summary.overdueRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between text-sm">
                <span className="text-red-700">
                  {req.recommender_name} - {req.college_name}
                </span>
                <Button size="sm" variant="outline" onClick={() => handleGenerateEmail('reminder', req)}>
                  Send Reminder
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={activeTab === 'recommenders' ? 'default' : 'outline'}
          onClick={() => setActiveTab('recommenders')}
        >
          Recommenders
        </Button>
        <Button
          variant={activeTab === 'requests' ? 'default' : 'outline'}
          onClick={() => setActiveTab('requests')}
        >
          Requests ({requests.length})
        </Button>
        <Button
          variant={activeTab === 'templates' ? 'default' : 'outline'}
          onClick={() => setActiveTab('templates')}
        >
          Email Templates
        </Button>
      </div>

      {/* Recommenders Tab */}
      {activeTab === 'recommenders' && (
        <>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="mr-2" size={20} />
              Add Recommender
            </Button>
          </div>

          {recommenders.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <Users className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-500 mb-4">No recommenders added yet</p>
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="mr-2" size={20} />
                Add Your First Recommender
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommenders.map((rec) => {
                const typeInfo = RECOMMENDER_TYPES[rec.type as keyof typeof RECOMMENDER_TYPES] || RECOMMENDER_TYPES.other;
                const Icon = typeInfo.icon;
                
                return (
                  <div key={rec.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                          <Icon size={20} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{rec.name}</h3>
                          <p className="text-xs text-gray-500">{typeInfo.label}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteRecommender(rec.id)}>
                        <Trash2 size={16} className="text-red-500" />
                      </Button>
                    </div>
                    
                    {rec.subject && (
                      <p className="text-sm text-gray-600 mb-2">{rec.subject}</p>
                    )}
                    
                    {rec.institution && (
                      <p className="text-sm text-gray-500 mb-2">{rec.institution}</p>
                    )}
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {rec.email && (
                        <a href={`mailto:${rec.email}`} className="flex items-center gap-1 text-xs text-blue-600">
                          <Mail size={12} />
                          {rec.email}
                        </a>
                      )}
                      {rec.phone && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Phone size={12} />
                          {rec.phone}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between pt-3 border-t">
                      <div className="text-sm">
                        <span className="text-green-600 font-medium">{rec.letters_submitted || 0}</span>
                        <span className="text-gray-500"> / {rec.total_requests || 0} letters</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedRecommender(rec);
                          setShowRequestForm(true);
                        }}
                      >
                        <Plus size={14} className="mr-1" />
                        Request
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <Mail className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-500 mb-4">No recommendation requests yet</p>
              <p className="text-sm text-gray-400">Add a recommender and create a request to get started</p>
            </div>
          ) : (
            requests.map((req) => (
              <div key={req.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{req.recommender_name}</h3>
                      <span className="text-xs text-gray-500">for</span>
                      <span className="font-medium text-blue-600">{req.college_name || 'General'}</span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      {req.application_system && (
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                          {req.application_system}
                        </span>
                      )}
                      {req.deadline && (
                        <span className={
                          new Date(req.deadline) < new Date() ? 'text-red-600' : ''
                        }>
                          Deadline: {getDaysUntilDeadline(req.deadline)}
                        </span>
                      )}
                      {req.submitted_date && (
                        <span className="text-green-600">
                          Submitted: {new Date(req.submitted_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Select
                      value={req.status}
                      onValueChange={(v) => handleUpdateRequestStatus(req.id, v)}
                    >
                      <SelectTrigger className={`w-36 ${STATUS_COLORS[req.status] || ''}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_requested">Not Requested</SelectItem>
                        <SelectItem value="requested">Requested</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="declined">Declined</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {req.status === 'requested' && (
                      <Button size="sm" variant="outline" onClick={() => handleGenerateEmail('reminder', req)}>
                        <Send size={14} />
                      </Button>
                    )}
                    
                    {req.status === 'submitted' && !req.thank_you_sent && (
                      <Button size="sm" variant="outline" onClick={() => handleGenerateEmail('thank_you', req)}>
                        Thank You
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Email Templates Tab */}
      {activeTab === 'templates' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Email Templates</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleGenerateEmail('request')}>
                Request Template
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleGenerateEmail('reminder')}>
                Reminder Template
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleGenerateEmail('thank_you')}>
                Thank You Template
              </Button>
            </div>
          </div>
          
          {emailTemplate ? (
            <>
              <div className="relative">
                <Textarea
                  value={emailTemplate}
                  onChange={(e) => setEmailTemplate(e.target.value)}
                  rows={15}
                  className="font-mono text-sm"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={copyToClipboard}
                >
                  <Copy size={14} className="mr-1" />
                  Copy
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Edit the template as needed, then copy and send via your email client
              </p>
            </>
          ) : (
            <div className="text-center py-8">
              <Mail className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-500">Select a template type to generate</p>
            </div>
          )}
        </div>
      )}

      {/* Add Recommender Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Add Recommender</h2>
            
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Dr. John Smith"
                />
              </div>
              
              <div>
                <Label>Type *</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({...formData, type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RECOMMENDER_TYPES).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="teacher@school.edu"
                />
              </div>
              
              <div>
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  placeholder="+1 234 567 8900"
                />
              </div>
              
              <div>
                <Label>Subject/Department</Label>
                <Input
                  value={formData.subject}
                  onChange={(e) => setFormData({...formData, subject: e.target.value})}
                  placeholder="AP Physics"
                />
              </div>
              
              <div>
                <Label>Institution</Label>
                <Input
                  value={formData.institution}
                  onChange={(e) => setFormData({...formData, institution: e.target.value})}
                  placeholder="School Name"
                />
              </div>
              
              <div>
                <Label>Years Known</Label>
                <Input
                  type="number"
                  value={formData.yearsKnown}
                  onChange={(e) => setFormData({...formData, yearsKnown: e.target.value})}
                  placeholder="2"
                />
              </div>
              
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
              <Button onClick={handleAddRecommender}>Add Recommender</Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Request Modal */}
      {showRequestForm && selectedRecommender && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              Request from {selectedRecommender.name}
            </h2>
            
            <div className="space-y-4">
              <div>
                <Label>College/University</Label>
                <Input
                  value={requestFormData.collegeName}
                  onChange={(e) => setRequestFormData({...requestFormData, collegeName: e.target.value})}
                  placeholder="Stanford University"
                />
              </div>
              
              <div>
                <Label>Application System</Label>
                <Select
                  value={requestFormData.applicationSystem}
                  onValueChange={(v) => setRequestFormData({...requestFormData, applicationSystem: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CommonApp">Common App</SelectItem>
                    <SelectItem value="Coalition">Coalition</SelectItem>
                    <SelectItem value="UCAS">UCAS</SelectItem>
                    <SelectItem value="Direct">Direct Application</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Deadline</Label>
                <Input
                  type="date"
                  value={requestFormData.deadline}
                  onChange={(e) => setRequestFormData({...requestFormData, deadline: e.target.value})}
                />
              </div>
              
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={requestFormData.notes}
                  onChange={(e) => setRequestFormData({...requestFormData, notes: e.target.value})}
                  placeholder="Any specific requirements..."
                  rows={2}
                />
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => handleGenerateEmail('request')}>
                <Mail size={16} className="mr-1" />
                Generate Email
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setShowRequestForm(false);
                  setSelectedRecommender(null);
                }}>
                  Cancel
                </Button>
                <Button onClick={handleCreateRequest}>Create Request</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Recommendations;
