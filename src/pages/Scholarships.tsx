import { useEffect, useState } from 'react';
import api from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Loader2, 
  Search, 
  GraduationCap,
  DollarSign,
  Globe,
  Calendar,
  ExternalLink,
  Star,
  Filter,
  Bookmark,
  BookmarkCheck,
  Award
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Scholarship {
  id: number;
  name: string;
  provider: string;
  country: string;
  amount: string;
  amount_min?: number;
  amount_max?: number;
  currency: string;
  deadline?: string;
  eligibility?: string;
  nationality_requirements: string[];
  academic_requirements: string[];
  need_based: number;
  merit_based: number;
  description?: string;
  application_url?: string;
  is_renewable: number;
  renewal_criteria?: string;
}

interface TrackedScholarship {
  id: number;
  scholarship_id: number;
  status: string;
  notes?: string;
  name: string;
  provider: string;
  country: string;
  amount: string;
  deadline?: string;
}

const Scholarships = () => {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [trackedScholarships, setTrackedScholarships] = useState<TrackedScholarship[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [showNeedBased, setShowNeedBased] = useState(false);
  const [showMeritBased, setShowMeritBased] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'tracked'>('all');
  const [trackingId, setTrackingId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, [searchTerm, selectedCountry, showNeedBased, showMeritBased]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [scholarshipsRes, countriesRes, trackedRes] = await Promise.all([
        api.scholarships.search({
          country: selectedCountry || undefined,
          needBased: showNeedBased || undefined,
          meritBased: showMeritBased || undefined,
          search: searchTerm || undefined,
        }),
        api.scholarships.getCountries(),
        api.scholarships.getUserTracked(),
      ]) as [any, any, any];
      
      setScholarships(scholarshipsRes.data || []);
      setCountries(countriesRes.data || []);
      setTrackedScholarships(trackedRes.data || []);
    } catch (error: any) {
      console.error('Failed to load scholarships:', error);
      toast.error('Failed to load scholarships');
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = async (scholarshipId: number) => {
    setTrackingId(scholarshipId);
    try {
      await api.scholarships.track(scholarshipId, 'interested');
      toast.success('Scholarship added to your list');
      loadData();
    } catch (error: any) {
      toast.error('Failed to track scholarship');
    } finally {
      setTrackingId(null);
    }
  };

  const handleUpdateTracking = async (scholarshipId: number, status: string) => {
    try {
      await api.scholarships.updateTracking(scholarshipId, { status });
      toast.success('Status updated');
      loadData();
    } catch (error: any) {
      toast.error('Failed to update status');
    }
  };

  const isTracked = (scholarshipId: number) => {
    return trackedScholarships.some(t => t.scholarship_id === scholarshipId);
  };

  const getDaysUntilDeadline = (dateStr: string) => {
    const days = Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Deadline passed';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days left`;
  };

  const formatAmount = (scholarship: Scholarship) => {
    if (scholarship.amount) return scholarship.amount;
    if (scholarship.amount_min && scholarship.amount_max) {
      return `${scholarship.currency} ${scholarship.amount_min.toLocaleString()} - ${scholarship.amount_max.toLocaleString()}`;
    }
    return 'Varies';
  };

  if (loading && scholarships.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Scholarship Database</h1>
        <p className="text-muted-foreground">Find and track scholarships from around the world</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-4 text-white">
          <div className="flex items-center gap-3">
            <Award className="opacity-80" size={24} />
            <div>
              <p className="text-2xl font-bold">{scholarships.length}</p>
              <p className="text-sm opacity-90">Available</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-4 text-white">
          <div className="flex items-center gap-3">
            <Bookmark className="opacity-80" size={24} />
            <div>
              <p className="text-2xl font-bold">{trackedScholarships.length}</p>
              <p className="text-sm opacity-90">Tracked</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-4 text-white">
          <div className="flex items-center gap-3">
            <DollarSign className="opacity-80" size={24} />
            <div>
              <p className="text-2xl font-bold">
                {scholarships.filter(s => s.need_based).length}
              </p>
              <p className="text-sm opacity-90">Need-Based</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-4 text-white">
          <div className="flex items-center gap-3">
            <Star className="opacity-80" size={24} />
            <div>
              <p className="text-2xl font-bold">
                {scholarships.filter(s => s.merit_based).length}
              </p>
              <p className="text-sm opacity-90">Merit-Based</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={activeTab === 'all' ? 'default' : 'outline'}
          onClick={() => setActiveTab('all')}
        >
          All Scholarships
        </Button>
        <Button
          variant={activeTab === 'tracked' ? 'default' : 'outline'}
          onClick={() => setActiveTab('tracked')}
        >
          My Tracked ({trackedScholarships.length})
        </Button>
      </div>

      {/* Filters */}
      {activeTab === 'all' && (
        <div className="bg-card rounded-xl border border-border p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search scholarships..."
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={selectedCountry || 'all'} onValueChange={(v) => setSelectedCountry(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-48">
                <Globe className="mr-2" size={16} />
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countries.map((country) => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant={showNeedBased ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowNeedBased(!showNeedBased)}
            >
              <DollarSign size={16} className="mr-1" />
              Need-Based
            </Button>
            
            <Button
              variant={showMeritBased ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowMeritBased(!showMeritBased)}
            >
              <Star size={16} className="mr-1" />
              Merit-Based
            </Button>
            
            {(selectedCountry || showNeedBased || showMeritBased || searchTerm) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedCountry('');
                  setShowNeedBased(false);
                  setShowMeritBased(false);
                  setSearchTerm('');
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Scholarship List */}
      {activeTab === 'all' ? (
        <div className="space-y-4">
          {scholarships.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-12 text-center">
              <GraduationCap className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-muted-foreground">No scholarships found matching your criteria</p>
            </div>
          ) : (
            scholarships.map((scholarship) => (
              <div
                key={scholarship.id}
                className="bg-card rounded-xl border border-border p-6 hover:border-primary/40 transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-foreground">{scholarship.name}</h3>
                      <div className="flex gap-2">
                        {scholarship.need_based === 1 && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                            Need-Based
                          </span>
                        )}
                        {scholarship.merit_based === 1 && (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                            Merit-Based
                          </span>
                        )}
                        {scholarship.is_renewable === 1 && (
                          <span className="px-2 py-0.5 bg-success/10 text-success text-xs rounded-full">
                            Renewable
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-3">{scholarship.provider}</p>
                    
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
                      <div className="flex items-center gap-1">
                        <Globe size={16} className="text-muted-foreground" />
                        {scholarship.country}
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign size={16} className="text-muted-foreground" />
                        {formatAmount(scholarship)}
                      </div>
                      {scholarship.deadline && (
                        <div className="flex items-center gap-1">
                          <Calendar size={16} className="text-muted-foreground" />
                          <span className={
                            new Date(scholarship.deadline) < new Date() 
                              ? 'text-red-600' 
                              : ''
                          }>
                            {getDaysUntilDeadline(scholarship.deadline)}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {scholarship.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {scholarship.description}
                      </p>
                    )}
                    
                    {scholarship.eligibility && (
                      <p className="text-sm text-muted-foreground">
                        <strong>Eligibility:</strong> {scholarship.eligibility}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-2 ml-4">
                    {isTracked(scholarship.id) ? (
                      <Button variant="outline" size="sm" disabled>
                        <BookmarkCheck size={16} className="mr-1 text-success" />
                        Tracked
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleTrack(scholarship.id)}
                        disabled={trackingId === scholarship.id}
                      >
                        {trackingId === scholarship.id ? (
                          <Loader2 size={16} className="animate-spin mr-1" />
                        ) : (
                          <Bookmark size={16} className="mr-1" />
                        )}
                        Track
                      </Button>
                    )}
                    
                    {scholarship.application_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(scholarship.application_url, '_blank')}
                      >
                        <ExternalLink size={16} className="mr-1" />
                        Apply
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {trackedScholarships.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-12 text-center">
              <Bookmark className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-500 mb-4">You haven't tracked any scholarships yet</p>
              <Button onClick={() => setActiveTab('all')}>
                Browse Scholarships
              </Button>
            </div>
          ) : (
            trackedScholarships.map((tracked) => (
              <div
                key={tracked.id}
                className="bg-card rounded-xl border border-border p-6"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{tracked.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">{tracked.provider}</p>
                    
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Globe size={16} className="text-muted-foreground" />
                        {tracked.country}
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign size={16} className="text-muted-foreground" />
                        {tracked.amount}
                      </div>
                      {tracked.deadline && (
                        <div className="flex items-center gap-1">
                          <Calendar size={16} className="text-muted-foreground" />
                          {getDaysUntilDeadline(tracked.deadline)}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <Select
                    value={tracked.status}
                    onValueChange={(v) => handleUpdateTracking(tracked.scholarship_id, v)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interested">Interested</SelectItem>
                      <SelectItem value="applying">Applying</SelectItem>
                      <SelectItem value="applied">Applied</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="withdrawn">Withdrawn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Scholarships;
