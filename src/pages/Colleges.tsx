// src/pages/Colleges.tsx
// College search and selection interface (TypeScript version)

import React, { useEffect, useState, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Globe, BookOpen } from 'lucide-react';
import api from '../services/api';

// ==================== TYPES ====================

interface College {
  id: number;
  name: string;
  location: string;
  country: string;
  type: string;
  acceptance_rate?: number | null;
  programs: string[] | string;
  description?: string | null;
}

interface CollegesApiResponse {
  data: College[];
}

interface FiltersApiResponse {
  data: string[];
}

interface CollegeCardProps {
  college: College;
  onAdd: () => void;
  onViewDetails: () => void;
  isAdding: boolean;
}

// ==================== MAIN COMPONENT ====================

const Colleges: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search & filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedProgram, setSelectedProgram] = useState<string>('');

  // Filter options
  const [countries, setCountries] = useState<string[]>([]);
  const [programs, setPrograms] = useState<string[]>([]);

  // Adding college
  const [addingCollegeId, setAddingCollegeId] = useState<number | null>(null);

  // Load filters on mount
  useEffect(() => {
    loadFilterOptions();
  }, []);

  // Reload colleges on filter change
  useEffect(() => {
    loadColleges();
  }, [searchTerm, selectedCountry, selectedProgram]);

  // ==================== DATA LOADERS ====================

  const loadFilterOptions = async (): Promise<void> => {
    try {
      const [countriesRes, programsRes] = await Promise.all([
        api.colleges.getCountries<FiltersApiResponse>(),
        api.colleges.getPrograms<FiltersApiResponse>(),
      ]);

      setCountries(countriesRes.data);
      setPrograms(programsRes.data);
    } catch (err) {
      console.error('Failed to load filter options:', err);
    }
  };

  const loadColleges = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string> = {};
      if (searchTerm) params.search = searchTerm;
      if (selectedCountry) params.country = selectedCountry;
      if (selectedProgram) params.program = selectedProgram;

      const response = await api.colleges.search<CollegesApiResponse>(params);
      setColleges(response.data);
    } catch (err) {
      setError('Failed to load colleges. Please try again.');
      console.error('Error loading colleges:', err);
    } finally {
      setLoading(false);
    }
  };

  // ==================== HANDLERS ====================

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setSearchTerm(e.target.value);
  };

  const handleAddCollege = async (collegeId: number): Promise<void> => {
    try {
      setAddingCollegeId(collegeId);

      const response = await api.applications.create<{
        message?: string;
      }>({
        college_id: collegeId,
        application_type: 'regular',
      });

      alert(
        response.message ||
          'College added successfully! Deadlines automatically created.'
      );

      navigate('/applications');
    } catch (err: any) {
      alert(
        err?.message ||
          'Failed to add college. You may have already added this college.'
      );
      console.error('Error adding college:', err);
    } finally {
      setAddingCollegeId(null);
    }
  };

  const handleViewDetails = (collegeId: number): void => {
    navigate(`/colleges/${collegeId}`);
  };

  // ==================== RENDER ====================

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Discover Colleges
          </h1>
          <p className="text-gray-600">
            Search and select colleges. Deadlines are generated automatically.
          </p>
        </div>

        {/* Search & Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="md:col-span-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search colleges..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Country */}
            <div>
              <label className="block text-sm font-medium mb-2">
                <Globe className="inline w-4 h-4 mr-1" />
                Country
              </label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="">All Countries</option>
                {countries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>

            {/* Program */}
            <div>
              <label className="block text-sm font-medium mb-2">
                <BookOpen className="inline w-4 h-4 mr-1" />
                Program
              </label>
              <select
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="">All Programs</option>
                {programs.map((program) => (
                  <option key={program} value={program}>
                    {program}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCountry('');
                  setSelectedProgram('');
                }}
                className="w-full px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="text-center py-12">Loading colleges...</div>
        ) : error ? (
          <div className="text-center text-red-600">{error}</div>
        ) : colleges.length === 0 ? (
          <div className="text-center text-gray-600">No colleges found</div>
        ) : (
          <>
            <div className="mb-4 text-gray-600">
              Found <strong>{colleges.length}</strong> colleges
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {colleges.map((college) => (
                <CollegeCard
                  key={college.id}
                  college={college}
                  onAdd={() => handleAddCollege(college.id)}
                  onViewDetails={() => handleViewDetails(college.id)}
                  isAdding={addingCollegeId === college.id}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ==================== CARD COMPONENT ====================

const CollegeCard: React.FC<CollegeCardProps> = ({
  college,
  onAdd,
  onViewDetails,
  isAdding,
}) => {
  const acceptanceRate = college.acceptance_rate
    ? `${(college.acceptance_rate * 100).toFixed(1)}%`
    : 'N/A';

  const programs: string[] = Array.isArray(college.programs)
    ? college.programs
    : typeof college.programs === 'string'
    ? JSON.parse(college.programs || '[]')
    : [];

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h3 className="text-lg font-semibold">{college.name}</h3>
      <p className="text-sm text-gray-600">
        {college.location}, {college.country}
      </p>

      <div className="text-sm mt-2">
        <span>Type: {college.type}</span>
        <br />
        <span>Acceptance Rate: {acceptanceRate}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {programs.slice(0, 3).map((program, i) => (
          <span
            key={i}
            className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full"
          >
            {program}
          </span>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onViewDetails}
          className="flex-1 border px-4 py-2 rounded-lg"
        >
          View Details
        </button>
        <button
          onClick={onAdd}
          disabled={isAdding}
          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {isAdding ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  );
};

export default Colleges;
