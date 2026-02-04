// src/pages/Colleges.tsx
import React, { useEffect, useState, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, BookOpen, MapPin, GraduationCap, DollarSign, Users, Award, TrendingUp, Filter, ChevronDown } from 'lucide-react';
import api from '../services/api';

/* ==================== TYPES ==================== */

interface CountryOption {
  value: string;
  label: string;
  count: number;
}

interface TestScores {
  satRange?: { percentile25: number; percentile75: number } | null;
  actRange?: { percentile25: number; percentile75: number } | null;
}

interface GraduationRates {
  fourYear?: number;
  sixYear?: number;
}

interface College {
  id: number;
  name: string;
  location: string;
  country: string;
  type: string;
  acceptance_rate?: number | null;
  acceptanceRate?: number | null;
  programs: string[];
  majorCategories?: string[];
  academicStrengths?: string[];
  description?: string | null;
  tuition_cost?: number | null;
  enrollment?: number | null;
  ranking?: number | null;
  averageGPA?: number | null;
  testScores?: TestScores;
  graduationRates?: GraduationRates | null;
  studentFacultyRatio?: string | null;
}

interface CollegeCardProps {
  college: College;
  onAdd: () => void;
  onViewDetails: () => void;
  isAdding: boolean;
}

/* ==================== MAIN ==================== */

const Colleges: React.FC = () => {
  const navigate = useNavigate();

  const [colleges, setColleges] = useState<College[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [programs, setPrograms] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [showFilters, setShowFilters] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingCollegeId, setAddingCollegeId] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  /* ==================== LOAD FILTERS ==================== */

  useEffect(() => {
    (async () => {
      try {
        const [countriesRes, programsRes] = await Promise.all([
          api.colleges.getCountries(),
          api.colleges.getPrograms()
        ]);
        // Handle both object format {value, label, count} and simple strings
        const countryData = countriesRes.data || [];
        const countryStrings = countryData.map((c: string | CountryOption) => 
          typeof c === 'string' ? c : c.value
        );
        setCountries(countryStrings);
        setPrograms(programsRes.data || []);
      } catch (err) {
        console.error('Failed to load filters', err);
      }
    })();
  }, []);

  /* ==================== LOAD COLLEGES ==================== */

  useEffect(() => {
    loadColleges();
  }, [searchTerm, selectedCountry, selectedProgram, sortBy]);

  const loadColleges = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {};
      if (selectedCountry) params.country = selectedCountry;
      
      // Use search endpoint only if there's a search term, otherwise use get to fetch all
      let res;
      if (searchTerm) {
        // Use search endpoint with 'q' parameter
        res = await api.colleges.search({ q: searchTerm, country: selectedCountry });
      } else {
        // Use get endpoint to fetch all colleges
        res = await api.colleges.get(params);
      }
      
      // Handle different response structures
      const raw = res?.data ?? res ?? [];
      
      if (!Array.isArray(raw)) {
        console.error('Expected array but got:', typeof raw, raw);
        setError('Invalid response format from server');
        setColleges([]);
        return;
      }

      // Normalize backend payload to UI shape
      const normalized: College[] = raw.map((c: any) => {
        // Parse JSON fields safely
        let majorCategories: string[] = [];
        let programs: string[] = [];
        let academicStrengths: string[] = [];
        
        try {
          if (Array.isArray(c.majorCategories)) {
            majorCategories = c.majorCategories;
          } else if (typeof c.majorCategories === 'string') {
            majorCategories = JSON.parse(c.majorCategories || '[]');
          }
          if (Array.isArray(c.programs)) {
            programs = c.programs;
          } else if (typeof c.programs === 'string') {
            programs = JSON.parse(c.programs || '[]');
          }
          if (Array.isArray(c.academicStrengths)) {
            academicStrengths = c.academicStrengths;
          }
        } catch (e) {
          console.warn('Failed to parse fields for', c.name, e);
        }
        
        return {
          id: c.id,
          name: c.name,
          location: c.location || '',
          country: c.country,
          type: c.type || c.trust_tier || 'Unknown',
          acceptance_rate: c.acceptanceRate ?? c.acceptance_rate ?? null,
          acceptanceRate: c.acceptanceRate ?? c.acceptance_rate ?? null,
          programs,
          majorCategories,
          academicStrengths,
          description: c.description || null,
          tuition_cost: c.tuition_cost || null,
          enrollment: c.enrollment || null,
          ranking: c.ranking || null,
          averageGPA: c.averageGPA || null,
          testScores: c.testScores || null,
          graduationRates: c.graduationRates || null,
          studentFacultyRatio: c.studentFacultyRatio || null
        };
      });
      
      // Sort colleges
      const sorted = [...normalized].sort((a, b) => {
        switch (sortBy) {
          case 'ranking':
            return (a.ranking || 999) - (b.ranking || 999);
          case 'acceptance_rate':
            return (a.acceptanceRate || 999) - (b.acceptanceRate || 999);
          case 'tuition':
            return (a.tuition_cost || 999999) - (b.tuition_cost || 999999);
          case 'name':
          default:
            return a.name.localeCompare(b.name);
        }
      });
      
      setTotalCount(sorted.length);
      setColleges(sorted);
    } catch (err) {
      setError('Failed to load colleges');
      console.error('Error loading colleges:', err);
    } finally {
      setLoading(false);
    }
  };

  /* ==================== ACTIONS ==================== */

  const handleAddCollege = async (collegeId: number) => {
    try {
      setAddingCollegeId(collegeId);

      await api.applications.create({
        college_id: collegeId,
        application_type: 'regular'
      });

      alert('College added successfully! Check your Applications page.');
      navigate('/applications');
    } catch (err: any) {
      console.error('Add college error:', err);
      
      // Check for duplicate error
      if (err.message && err.message.includes('already added')) {
        alert('This college is already in your list! Check your Applications page.');
      } else {
        alert('Failed to add college. Please try again.');
      }
    } finally {
      setAddingCollegeId(null);
    }
  };

  /* ==================== RENDER ==================== */

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Discover Colleges</h1>
            <p className="text-gray-600 mt-1">
              {loading ? 'Loading...' : `Showing ${colleges.length.toLocaleString()} colleges`}
            </p>
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* SEARCH / FILTERS */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search colleges by name, location, or major..."
              className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg"
            />
          </div>
          
          {/* Filters Row */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2"
                >
                  <option value="">All Countries</option>
                  {countries.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Program</label>
                <select
                  value={selectedProgram}
                  onChange={(e) => setSelectedProgram(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2"
                >
                  <option value="">All Programs</option>
                  {programs.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2"
                >
                  <option value="name">Name (A-Z)</option>
                  <option value="ranking">Ranking (Best First)</option>
                  <option value="acceptance_rate">Acceptance Rate (Lowest)</option>
                  <option value="tuition">Tuition (Lowest)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCountry('');
                    setSelectedProgram('');
                    setSortBy('name');
                  }}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RESULTS */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        )}
        {error && <div className="text-center text-red-600 py-12">{error}</div>}
        {!loading && !error && colleges.length === 0 && (
          <div className="text-center py-12">
            <Globe className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-600">No colleges found</h3>
            <p className="text-gray-500 mt-2">Try adjusting your search or filters</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {colleges.map(college => (
            <CollegeCard
              key={college.id}
              college={college}
              onAdd={() => handleAddCollege(college.id)}
              onViewDetails={() => navigate(`/colleges/${college.id}`)}
              isAdding={addingCollegeId === college.id}
            />
          ))}
        </div>

      </div>
    </div>
  );
};

/* ==================== RICH COLLEGE CARD ==================== */

const CollegeCard: React.FC<CollegeCardProps> = ({
  college,
  onAdd,
  onViewDetails,
  isAdding
}) => {
  // Format acceptance rate properly
  const formatAcceptanceRate = (rate: number | null | undefined): string => {
    if (rate === null || rate === undefined) return 'N/A';
    // If rate is in decimal form (0-1), multiply by 100
    const percentage = rate <= 1 ? rate * 100 : rate;
    return `${percentage.toFixed(1)}%`;
  };
  
  // Format currency
  const formatCurrency = (amount: number | null | undefined, country: string): string => {
    if (amount === null || amount === undefined) return 'N/A';
    if (country === 'India') {
      return `₹${(amount / 100000).toFixed(1)}L`;
    } else if (country === 'United Kingdom') {
      return `£${(amount / 1000).toFixed(0)}K`;
    } else if (country === 'Germany') {
      return amount === 0 ? 'Free' : `€${amount.toLocaleString()}`;
    }
    return `$${(amount / 1000).toFixed(0)}K`;
  };
  
  // Format enrollment
  const formatEnrollment = (num: number | null | undefined): string => {
    if (!num) return 'N/A';
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const acceptanceRate = college.acceptanceRate ?? college.acceptance_rate;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200 card-gradient-hover">
      {/* Header with gradient */}
      <div className="gradient-header p-4 text-white">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="text-lg font-semibold leading-tight">{college.name}</h3>
            <div className="flex items-center gap-1 mt-1 text-white/80 text-sm">
              <MapPin className="w-3 h-3" />
              {college.location || college.country}
            </div>
          </div>
          {college.ranking && (
            <div className="bg-white/20 rounded-lg px-2 py-1">
              <span className="text-xs font-medium">#{college.ranking}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{college.type}</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{college.country}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 p-4 border-b border-gray-100">
        <StatBox
          icon={<TrendingUp className="w-4 h-4 text-green-600" />}
          label="Acceptance"
          value={formatAcceptanceRate(acceptanceRate)}
        />
        <StatBox
          icon={<DollarSign className="w-4 h-4 text-blue-600" />}
          label="Tuition"
          value={formatCurrency(college.tuition_cost, college.country)}
        />
        <StatBox
          icon={<GraduationCap className="w-4 h-4 text-purple-600" />}
          label="Avg GPA"
          value={college.averageGPA ? college.averageGPA.toFixed(2) : 'N/A'}
        />
        <StatBox
          icon={<Users className="w-4 h-4 text-orange-600" />}
          label="Students"
          value={formatEnrollment(college.enrollment)}
        />
      </div>

      {/* Programs/Majors Tags */}
      <div className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {(college.majorCategories || college.programs || []).slice(0, 4).map((p, idx) => (
            <span
              key={`${p}-${idx}`}
              className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full font-medium"
            >
              {p}
            </span>
          ))}
          {(college.majorCategories?.length || college.programs?.length || 0) > 4 && (
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
              +{(college.majorCategories?.length || college.programs?.length || 0) - 4} more
            </span>
          )}
        </div>
      </div>

      {/* Test Scores (if available) */}
      {college.testScores?.satRange && (
        <div className="px-4 pb-3">
          <div className="text-xs text-gray-500">
            SAT: {college.testScores.satRange.percentile25}-{college.testScores.satRange.percentile75}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 p-4 bg-gray-50">
        <button
          onClick={onViewDetails}
          className="flex-1 border border-gray-200 bg-white rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          View Details
        </button>
        <button
          onClick={onAdd}
          disabled={isAdding}
          className="flex-1 btn-gradient rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {isAdding ? 'Adding…' : 'Add to List'}
        </button>
      </div>
    </div>
  );
};

/* ==================== STAT BOX COMPONENT ==================== */

interface StatBoxProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const StatBox: React.FC<StatBoxProps> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2">
    <div className="p-1.5 bg-gray-50 rounded-lg">{icon}</div>
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  </div>
);

export default Colleges;
