// Research Page - Major-based search and college research
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GraduationCap, Globe, ExternalLink, AlertCircle } from 'lucide-react';
import api from '../services/api';

interface College {
  id: number;
  name: string;
  country: string;
  location?: string;
  official_website: string;
  admissions_url?: string;
  majorCategories?: string[];
  academicStrengths?: string[];
}

const Research: React.FC = () => {
  const navigate = useNavigate();
  const [searchType, setSearchType] = useState<'major' | 'all'>('major');
  const [majorQuery, setMajorQuery] = useState('');
  const [generalQuery, setGeneralQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [colleges, setColleges] = useState<College[]>([]);
  const [availableMajors, setAvailableMajors] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFilters();
  }, []);

  const loadFilters = async () => {
    try {
      const [majorsRes, countriesRes] = await Promise.all([
        api.research.getAvailableMajors(),
        api.colleges.getCountries()
      ]);
      
      // Handle both string arrays and object arrays for majors
      const majorsData = majorsRes.data || [];
      const normalizedMajors = Array.isArray(majorsData)
        ? majorsData.map((item: any) => typeof item === 'string' ? item : item.value || item.label || item)
        : [];
      
      // Handle both string arrays and object arrays for countries
      const countriesData = countriesRes.data || [];
      const normalizedCountries = Array.isArray(countriesData)
        ? countriesData.map((item: any) => typeof item === 'string' ? item : item.value || item.label || item)
        : [];
      
      setAvailableMajors(normalizedMajors);
      setCountries(normalizedCountries);
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  };

  const handleMajorSearch = async () => {
    if (!majorQuery.trim()) {
      setError('Please enter a major/program name');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Use the correct API method from the namespace
      const res = await api.research.searchByMajor(majorQuery.trim(), selectedCountry || undefined);
      
      console.log('Major search response:', res);
      
      // Handle response format
      const data = res?.data || res || [];
      setColleges(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setColleges([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneralSearch = async () => {
    if (!generalQuery.trim()) {
      setError('Please enter a search query');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Use the correct API method from the namespace
      const res = await api.research.search(generalQuery.trim(), selectedCountry || undefined, 'all');
      
      console.log('General search response:', res);
      
      // Handle response format
      const data = res?.data || res || [];
      setColleges(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setColleges([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">College Research Engine</h1>
        <p className="text-gray-600 mb-8">
          Search colleges by major, program, or name. All results link to official university sources.
        </p>

        {/* Search Type Toggle */}
        <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
          <div className="flex gap-4">
            <button
              onClick={() => setSearchType('major')}
              className={`px-4 py-2 rounded-lg ${
                searchType === 'major'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <GraduationCap className="w-4 h-4 inline mr-2" />
              Search by Major
            </button>
            <button
              onClick={() => setSearchType('all')}
              className={`px-4 py-2 rounded-lg ${
                searchType === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Search className="w-4 h-4 inline mr-2" />
              General Search
            </button>
          </div>
        </div>

        {/* Search Form */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
          {searchType === 'major' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Major/Program Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={majorQuery}
                    onChange={(e) => setMajorQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleMajorSearch()}
                    placeholder="e.g., Computer Science, Engineering, Medicine"
                    className="flex-1 border rounded-lg px-4 py-3"
                    list="majors-list"
                  />
                  <datalist id="majors-list">
                    {availableMajors.slice(0, 50).map((major, idx) => (
                      <option key={`major-${idx}`} value={major} />
                    ))}
                  </datalist>
                  <button
                    onClick={handleMajorSearch}
                    disabled={loading}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {loading ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Search Query</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={generalQuery}
                    onChange={(e) => setGeneralQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleGeneralSearch()}
                    placeholder="Search by college name, location, or any keyword"
                    className="flex-1 border rounded-lg px-4 py-3"
                  />
                  <button
                    onClick={handleGeneralSearch}
                    disabled={loading}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {loading ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Country Filter */}
          <div className="mt-4">
            <label className="block text-sm font-medium mb-2">Filter by Country (Optional)</label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="border rounded-lg px-4 py-2 w-full md:w-auto"
            >
              <option value="">All Countries</option>
              {countries.map((c, idx) => (
                <option key={`country-${idx}`} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <AlertCircle className="w-5 h-5 inline mr-2" />
            {error}
          </div>
        )}

        {/* Results */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Searching colleges...</p>
          </div>
        )}

        {!loading && colleges.length > 0 && (
          <div className="mb-4 text-gray-600">
            Found {colleges.length} college{colleges.length !== 1 ? 's' : ''}
          </div>
        )}

        {!loading && colleges.length === 0 && !error && (
          <div className="text-center py-12 text-gray-500">
            {searchType === 'major'
              ? 'Enter a major/program name to search'
              : 'Enter a search query to find colleges'}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {colleges.map((college) => (
            <div
              key={college.id}
              className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold mb-2">{college.name}</h3>
              <p className="text-sm text-gray-600 mb-4">
                {college.location || ''} {college.location && college.country ? ', ' : ''}
                {college.country}
              </p>

              {college.majorCategories && college.majorCategories.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-2">Major Categories:</p>
                  <div className="flex flex-wrap gap-1">
                    {college.majorCategories.slice(0, 5).map((major, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full"
                      >
                        {major}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 mt-4">
                <a
                  href={college.official_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline flex items-center"
                >
                  <Globe className="w-4 h-4 mr-1" />
                  Official Website
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
                {college.admissions_url && (
                  <a
                    href={college.admissions_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center"
                  >
                    Admissions Page
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                )}
                <button
                  onClick={() => navigate(`/colleges/${college.id}`)}
                  className="text-sm text-gray-700 hover:text-blue-600 mt-2 text-left"
                >
                  View Details →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Research;