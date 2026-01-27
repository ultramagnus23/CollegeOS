// src/pages/Colleges.tsx
import React, { useEffect, useState, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, BookOpen } from 'lucide-react';
import api from '../services/api';

/* ==================== TYPES ==================== */

interface College {
  id: number;
  name: string;
  location: string;
  country: string;
  type: string;
  acceptance_rate?: number | null;
  programs: string[];
  description?: string | null;
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingCollegeId, setAddingCollegeId] = useState<number | null>(null);

  /* ==================== LOAD FILTERS ==================== */

  useEffect(() => {
    (async () => {
      try {
        const [countriesRes, programsRes] = await Promise.all([
          api.colleges.getCountries(),
          api.colleges.getPrograms()
        ]);
        setCountries(countriesRes.data);
        setPrograms(programsRes.data);
      } catch (err) {
        console.error('Failed to load filters', err);
      }
    })();
  }, []);

  /* ==================== LOAD COLLEGES ==================== */

  useEffect(() => {
    loadColleges();
  }, [searchTerm, selectedCountry, selectedProgram]);

  const loadColleges = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {};
      
      // Expand region-based filters to country codes
      const regionMappings: Record<string, string[]> = {
        'ASIA': ['SG', 'HK', 'JP', 'KR', 'CN', 'TW', 'MY', 'TH', 'PH', 'VN', 'ID'],
        'EU': ['DE', 'FR', 'NL', 'IT', 'ES', 'AT', 'BE', 'CH', 'SE', 'DK', 'NO', 'FI', 'IE', 'PT', 'PL', 'CZ', 'HU', 'GR', 'RO']
      };
      
      if (selectedCountry) {
        if (regionMappings[selectedCountry]) {
          params.countries = regionMappings[selectedCountry];
        } else if (selectedCountry === 'UK') {
          params.country = 'UK'; // Also accept GB
        } else {
          params.country = selectedCountry;
        }
      }
      
      // Use search endpoint only if there's a search term, otherwise use get to fetch all
      let res;
      if (searchTerm) {
        // Use search endpoint with 'q' parameter
        res = await api.colleges.search({ q: searchTerm, country: selectedCountry });
      } else {
        // Use get endpoint to fetch all colleges
        res = await api.colleges.get(params);
      }
      
      // Debug logging
      console.log('API Response:', res);
      
      // Handle different response structures
      // Backend returns { success: true, data: [...], count: X }
      const raw = res?.data ?? res ?? [];
      
      if (!Array.isArray(raw)) {
        console.error('Expected array but got:', typeof raw, raw);
        setError('Invalid response format from server');
        setColleges([]);
        return;
      }

      // Normalize backend payload to UI shape
      // Handle new schema: official_website, major_categories, academic_strengths
      const normalized: College[] = raw.map((c: any) => {
        // Parse JSON fields safely
        let majorCategories: string[] = [];
        try {
          if (Array.isArray(c.majorCategories)) {
            majorCategories = c.majorCategories;
          } else if (typeof c.majorCategories === 'string') {
            majorCategories = JSON.parse(c.majorCategories || '[]');
          } else if (Array.isArray(c.programs)) {
            majorCategories = c.programs; // Fallback to old field name
          }
        } catch (e) {
          console.warn('Failed to parse majorCategories for', c.name, e);
        }
        
        return {
          id: c.id,
          name: c.name,
          location: c.location || '',
          country: c.country,
          type: c.type || c.trust_tier || 'official',
          acceptance_rate: c.acceptance_rate ?? null, // Include from database
          programs: majorCategories,
          description: c.description || null
        };
      });
      
      console.log('Normalized colleges:', normalized.length, normalized);
      setColleges(normalized);
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

        <h1 className="text-3xl font-bold mb-6">Discover Colleges</h1>

        {/* SEARCH / FILTERS */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">

          <div className="md:col-span-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search colleges..."
              className="w-full pl-10 pr-4 py-3 border rounded-lg"
            />
          </div>

          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
            <option value="">All Countries</option>
            <option value="US">🇺🇸 United States</option>
            <option value="UK">🇬🇧 United Kingdom</option>
            <option value="IN">🇮🇳 India</option>
            <option value="SG">🇸🇬 Singapore</option>
            <option value="HK">🇭🇰 Hong Kong</option>
            <option value="ASIA">🌏 Asia</option>
            <option value="EU">🇪🇺 Europe</option>
          </select>

          <select
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
            <option value="">All Programs</option>
            {programs.map(p => <option key={p}>{p}</option>)}
          </select>

          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedCountry('');
              setSelectedProgram('');
            }}
            className="border rounded-lg px-4 py-2"
          >
            Clear
          </button>
        </div>

        {/* RESULTS */}
        {loading && <div className="text-center py-12">Loading...</div>}
        {error && <div className="text-center text-red-600">{error}</div>}
        {!loading && !error && colleges.length === 0 && (
          <div className="text-center text-gray-600">No colleges found</div>
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

/* ==================== CARD ==================== */

const CollegeCard: React.FC<CollegeCardProps> = ({
  college,
  onAdd,
  onViewDetails,
  isAdding
}) => {
  const acceptance =
    college.acceptance_rate != null
      ? `${(college.acceptance_rate > 1 ? college.acceptance_rate : college.acceptance_rate * 100).toFixed(1)}%`
      : 'N/A';

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h3 className="text-lg font-semibold">{college.name}</h3>
      <p className="text-sm text-gray-600">
        {college.location}, {college.country}
      </p>

      <p className="text-sm mt-2">Type: {college.type}</p>
      <p className="text-sm">Acceptance: {acceptance}</p>

      <div className="flex flex-wrap gap-2 mt-3">
        {(college.programs || []).slice(0, 3).map(p => (
          <span
            key={p}
            className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full"
          >
            {p}
          </span>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={onViewDetails}
          className="flex-1 border rounded-lg py-2"
        >
          View
        </button>
        <button
          onClick={onAdd}
          disabled={isAdding}
          className="flex-1 bg-blue-600 text-white rounded-lg py-2 disabled:opacity-50"
        >
          {isAdding ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  );
};

export default Colleges;
