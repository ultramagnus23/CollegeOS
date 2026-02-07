import { useEffect, useState } from 'react';
import api from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Plus, 
  Trash2, 
  Loader2, 
  FileText, 
  Upload,
  FolderOpen,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  Tag,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Document {
  id: number;
  name: string;
  category: string;
  file_type?: string;
  file_size?: number;
  file_url?: string;
  description?: string;
  status: string;
  expiry_date?: string;
  tags: string[];
  college_ids: number[];
  created_at: string;
  updated_at: string;
}

interface DocumentSummary {
  categories: { category: string; count: number; verified_count: number; expired_count: number }[];
  expiring: Document[];
  totalDocuments: number;
}

const CATEGORIES = {
  transcript: { label: 'Transcripts', icon: FileText, color: 'bg-blue-100 text-blue-700' },
  test_score: { label: 'Test Scores', icon: FileText, color: 'bg-green-100 text-green-700' },
  essay: { label: 'Essays', icon: FileText, color: 'bg-purple-100 text-purple-700' },
  recommendation: { label: 'Recommendations', icon: FileText, color: 'bg-yellow-100 text-yellow-700' },
  financial: { label: 'Financial', icon: FileText, color: 'bg-orange-100 text-orange-700' },
  proof: { label: 'Proof Documents', icon: FileText, color: 'bg-cyan-100 text-cyan-700' },
  passport: { label: 'Passport/ID', icon: FileText, color: 'bg-red-100 text-red-700' },
  portfolio: { label: 'Portfolio', icon: FileText, color: 'bg-pink-100 text-pink-700' },
  other: { label: 'Other', icon: FileText, color: 'bg-gray-100 text-gray-700' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  uploaded: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-700',
};

const Documents = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    category: 'transcript',
    description: '',
    status: 'pending',
    fileUrl: '',
    expiryDate: '',
  });

  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [docsRes, summaryRes] = await Promise.all([
        api.documents.getAll({ category: selectedCategory || undefined }),
        api.documents.getSummary(),
      ]) as [any, any];
      
      setDocuments(docsRes.data || []);
      setSummary(summaryRes.data || null);
    } catch (error: any) {
      console.error('Failed to load documents:', error);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.category) {
      toast.error('Please fill required fields');
      return;
    }

    try {
      await api.documents.create({
        name: formData.name,
        category: formData.category,
        description: formData.description,
        status: formData.status,
        fileUrl: formData.fileUrl,
        expiryDate: formData.expiryDate || undefined,
      });
      toast.success('Document added');
      setShowAddForm(false);
      setFormData({
        name: '',
        category: 'transcript',
        description: '',
        status: 'pending',
        fileUrl: '',
        expiryDate: '',
      });
      loadData();
    } catch (error: any) {
      toast.error('Failed to add document');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this document?')) return;

    try {
      await api.documents.delete(id);
      toast.success('Document deleted');
      loadData();
    } catch (error: any) {
      toast.error('Failed to delete document');
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.documents.update(id, { status: newStatus });
      toast.success('Status updated');
      loadData();
    } catch (error: any) {
      toast.error('Failed to update status');
    }
  };

  const getDaysUntilExpiry = (dateStr: string) => {
    const days = Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Expired';
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Expires tomorrow';
    return `Expires in ${days} days`;
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Document Vault</h1>
          <p className="text-gray-600">Store and manage all your application documents in one place</p>
        </div>
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="mr-2" size={20} />
          Add Document
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FolderOpen className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.totalDocuments || 0}</p>
              <p className="text-sm text-gray-600">Total Documents</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {summary?.categories?.reduce((sum, c) => sum + (c.verified_count || 0), 0) || 0}
              </p>
              <p className="text-sm text-gray-600">Verified</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="text-yellow-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">{summary?.expiring?.length || 0}</p>
              <p className="text-sm text-gray-600">Expiring Soon</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="text-red-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {summary?.categories?.reduce((sum, c) => sum + (c.expired_count || 0), 0) || 0}
              </p>
              <p className="text-sm text-gray-600">Expired</p>
            </div>
          </div>
        </div>
      </div>

      {/* Expiring Soon Alert */}
      {summary?.expiring && summary.expiring.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-yellow-600" size={20} />
            <h3 className="font-semibold text-yellow-800">Documents Expiring Soon</h3>
          </div>
          <div className="space-y-2">
            {summary.expiring.slice(0, 3).map((doc) => (
              <div key={doc.id} className="flex items-center justify-between text-sm">
                <span className="text-yellow-700">{doc.name}</span>
                <span className="text-yellow-600 font-medium">
                  {doc.expiry_date ? getDaysUntilExpiry(doc.expiry_date) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter by Category */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filter by:</span>
        </div>
        <Select value={selectedCategory || 'all'} onValueChange={(v) => setSelectedCategory(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORIES).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedCategory && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedCategory('')}>
            Clear
          </Button>
        )}
      </div>

      {/* Category Quick Access */}
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2 mb-6">
        {Object.entries(CATEGORIES).map(([key, { label, color }]) => {
          const count = summary?.categories?.find(c => c.category === key)?.count || 0;
          return (
            <button
              key={key}
              onClick={() => setSelectedCategory(selectedCategory === key ? '' : key)}
              className={`p-3 rounded-lg border text-center transition ${
                selectedCategory === key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-xs font-medium text-gray-700">{label}</p>
              <p className="text-lg font-bold text-gray-900">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Document</h2>
            
            <div className="space-y-4">
              <div>
                <Label>Document Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g., High School Transcript"
                />
              </div>
              
              <div>
                <Label>Category *</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIES).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Optional description"
                />
              </div>
              
              <div>
                <Label>File/Link URL</Label>
                <Input
                  value={formData.fileUrl}
                  onChange={(e) => setFormData({...formData, fileUrl: e.target.value})}
                  placeholder="https://drive.google.com/..."
                />
              </div>
              
              <div>
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={formData.expiryDate}
                  onChange={(e) => setFormData({...formData, expiryDate: e.target.value})}
                />
              </div>
              
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="uploaded">Uploaded</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
              <Button onClick={handleAdd}>Add Document</Button>
            </div>
          </div>
        </div>
      )}

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Upload className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-500 mb-4">
            {selectedCategory ? `No ${CATEGORIES[selectedCategory as keyof typeof CATEGORIES]?.label || 'documents'} found` : 'No documents uploaded yet'}
          </p>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="mr-2" size={20} />
            Add Your First Document
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => {
            const categoryInfo = CATEGORIES[doc.category as keyof typeof CATEGORIES] || CATEGORIES.other;
            return (
              <div key={doc.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${categoryInfo.color}`}>
                      <FileText size={20} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{doc.name}</h3>
                      <p className="text-xs text-gray-500">{categoryInfo.label}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(doc.id)}>
                    <Trash2 size={16} className="text-red-500" />
                  </Button>
                </div>
                
                {doc.description && (
                  <p className="text-sm text-gray-600 mb-3">{doc.description}</p>
                )}
                
                <div className="flex items-center justify-between">
                  <Select
                    value={doc.status}
                    onValueChange={(v) => handleStatusChange(doc.id, v)}
                  >
                    <SelectTrigger className={`w-28 h-8 text-xs ${STATUS_COLORS[doc.status] || ''}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="uploaded">Uploaded</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {doc.file_url && (
                    <Button variant="ghost" size="sm" onClick={() => window.open(doc.file_url, '_blank')}>
                      <ExternalLink size={16} />
                    </Button>
                  )}
                </div>
                
                {doc.expiry_date && (
                  <div className={`mt-3 text-xs ${
                    new Date(doc.expiry_date) < new Date() ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {getDaysUntilExpiry(doc.expiry_date)}
                  </div>
                )}
                
                {doc.tags && doc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {doc.tags.map((tag, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                        <Tag size={10} />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Documents;
