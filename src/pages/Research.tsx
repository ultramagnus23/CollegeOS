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
  const [searchType, setSearchType] = useState<'intelligent' | 'major' | 'all'>('intelligent');
  const [intelligentQuery, setIntelligentQuery] = useState('');
  const [majorQuery, setMajorQuery] = useState('');
  const [generalQuery, setGeneralQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [colleges, setColleges] = useState<College[]>([]);
  const [availableMajors, setAvailableMajors] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInfo, setSearchInfo] = useState<any>(null);

  useEffect(() => {
    loadFilters();
  }, []);

  const loadFilters = async () => {
    try {
      const [majorsRes, countriesRes] = await Promise.all([
        api.research.getAvailableMajors(),
        api.colleges.getCountries()
      ]);
      setAvailableMajors(majorsRes.data || []);
      setCountries(countriesRes.data || []);
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  };

  const handleIntelligentSearch = async () => {
    if (!intelligentQuery.trim()) {
      setError('Please enter a search query');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSearchInfo(null);
      
      // Use intelligent search API
      const res = await api.intelligentSearch.search(intelligentQuery.trim(), {
        filters: { country: selectedCountry || undefined }
      });
      
      console.log('Intelligent search response:', res);
      
      // Handle different response types from intelligent search
      if (res.success) {
        setSearchInfo({
          type: res.type,
          explanation: res.explanation,
          suggestion: res.suggestion
        });

        // Extract colleges from response
        let collegesData = [];
        if (res.colleges && Array.isArray(res.colleges)) {
          collegesData = res.colleges;
        } else if (res.data && Array.isArray(res.data)) {
          collegesData = res.data;
        } else if (res.results && Array.isArray(res.results)) {
          collegesData = res.results;
        }

        setColleges(collegesData);
      } else {
        setError(res.message || 'Search failed');
        setColleges([]);
      }
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setColleges([]);
    } finally {
      setLoading(false);
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
        <h1 className="text-3xl font-bold mb-6">College Research & Search</h1>
        <p className="text-gray-600 mb-8">
          Intelligent search with query understanding, major-based search, or general college discovery.
        </p>

        {/* Search Type Toggle */}
        <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
          <div className="flex gap-4 flex-wrap">
            <button
              onClick={() => setSearchType('intelligent')}
              className={`px-4 py-2 rounded-lg ${
                searchType === 'intelligent'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Search className="w-4 h-4 inline mr-2" />
              Intelligent Search
            </button>
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
              <Globe className="w-4 h-4 inline mr-2" />
              Browse All
            </button>
          </div>
        </div>

        {/* Search Form */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
          {searchType === 'intelligent' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Ask anything about colleges, programs, or admissions
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={intelligentQuery}
                    onChange={(e) => setIntelligentQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleIntelligentSearch()}
                    placeholder="e.g., 'MIT requirements', 'engineering colleges in US', 'UCAS process'"
                    className="flex-1 border rounded-lg px-4 py-3"
                  />
                  <button
                    onClick={handleIntelligentSearch}
                    disabled={loading}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {loading ? 'Searching...' : 'Search'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  💡 The system understands your query and provides relevant colleges, processes, or requirements
                </p>
              </div>
            </div>
          ) : searchType === 'major' ? (
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
                    {availableMajors.slice(0, 50).map((major) => (
                      <option key={major} value={major} />
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
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Info (for intelligent search) */}
        {searchInfo && (
          <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-lg mb-6">
            <div className="font-medium">Query Type: {searchInfo.type}</div>
            {searchInfo.explanation && <p className="text-sm mt-1">{searchInfo.explanation}</p>}
            {searchInfo.suggestion && <p className="text-sm text-blue-700 mt-1">💡 {searchInfo.suggestion}</p>}
          </div>
        )}

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
            {searchType === 'intelligent'
              ? 'Ask any question about colleges, programs, or admissions to get started'
              : searchType === 'major'
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
