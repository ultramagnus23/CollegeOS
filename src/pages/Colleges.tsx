import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const Colleges = () => {
  const [colleges, setColleges] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<number | null>(null);

  useEffect(() => {
    loadColleges();
  }, []);

  const loadColleges = async () => {
    try {
      const response = await api.getColleges({ limit: 50 });
      setColleges(response.data || []);
    } catch (error: any) {
      toast.error('Failed to load colleges');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!search.trim()) {
      loadColleges();
      return;
    }

    setLoading(true);
    try {
      const response = await api.searchColleges(search);
      setColleges(response.data || []);
    } catch (error: any) {
      toast.error('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApplication = async (collegeId: number) => {
    setCreating(collegeId);
    try {
      await api.createApplication({
        collegeId,
        priority: 'target',
        notes: ''
      });
      toast.success('Application created successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create application');
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Browse Colleges</h1>
        <p className="text-gray-600">Explore universities from around the world</p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <Input
              placeholder="Search colleges by name or country..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button onClick={handleSearch}>
            Search
          </Button>
        </div>
      </div>

      {/* Colleges Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-blue-600" size={40} />
        </div>
      ) : colleges.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-500">No colleges found. Try a different search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {colleges.map((college) => (
            <div key={college.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition">
              <div className="mb-4">
                <h3 className="text-xl font-bold text-gray-900 mb-1">{college.name}</h3>
                <p className="text-sm text-gray-600 flex items-center">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                  {college.country}
                </p>
              </div>

              {college.academic_strengths && college.academic_strengths.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Academic Strengths</p>
                  <div className="flex flex-wrap gap-2">
                    {JSON.parse(college.academic_strengths).slice(0, 3).map((strength: string, idx: number) => (
                      <span key={idx} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                        {strength}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button
                  onClick={() => handleCreateApplication(college.id)}
                  disabled={creating === college.id}
                  className="flex-1"
                  size="sm"
                >
                  {creating === college.id ? (
                    <Loader2 className="animate-spin mr-2" size={16} />
                  ) : (
                    <Plus className="mr-2" size={16} />
                  )}
                  Add to Applications
                </Button>
                <Button
                  onClick={() => window.open(college.official_website, '_blank')}
                  variant="outline"
                  size="sm"
                >
                  <ExternalLink size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Colleges;