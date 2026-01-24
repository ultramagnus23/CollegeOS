// ==========================================
// FILE: src/pages/IntelligentCollegeSearch.tsx
// ==========================================
import { useState } from 'react';
import { Search, Database, Globe, Layers, TrendingUp } from 'lucide-react';
import { StudentProfile } from '../types';
import api from '../services/api';

interface Props {
  studentProfile: StudentProfile | null;
}

const IntelligentCollegeSearch: React.FC<Props> = ({ studentProfile }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchLayer, setSearchLayer] = useState<number | null>(null);
  const [searchSource, setSearchSource] = useState('');

  const performSearch = async () => {
    if (!query.trim()) return;

    setSearching(true);
    setResults([]);
    setSearchLayer(null);

    try {
      const response = await api.intelligentSearch(query.trim(), {
        profile: studentProfile
      });

      if (response.success) {
        setResults(response.results || response.data || []);
        setSearchLayer(response.layer || 1);
        setSearchSource(response.source || 'database');
      } else {
        console.error('Search failed:', response);
        setResults([]);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const getLayerInfo = () => {
    switch(searchLayer) {
      case 1:
        return {
          icon: <Database className="w-5 h-5" />,
          text: 'Results from your database',
          color: 'bg-green-100 text-green-800 border-green-300'
        };
      case 2:
        return {
          icon: <Globe className="w-5 h-5" />,
          text: 'Scraped from university websites',
          color: 'bg-blue-100 text-blue-800 border-blue-300'
        };
      case 3:
        return {
          icon: <TrendingUp className="w-5 h-5" />,
          text: 'Found via general web search',
          color: 'bg-purple-100 text-purple-800 border-purple-300'
        };
      default:
        return null;
    }
  };

  const layerInfo = getLayerInfo();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Layers className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">3-Layer Intelligent Search</h1>
              <p className="text-sm text-gray-600">Database → University Sites → Web Search</p>
              {studentProfile && (
                <p className="text-xs text-blue-600 mt-1">
                  Personalized for {studentProfile.name}
                </p>
              )}
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && performSearch()}
              placeholder="Search for colleges, programs, or requirements..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={performSearch}
              disabled={searching || !query.trim()}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-2"
            >
              <Search className="w-5 h-5" />
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Layer Indicator */}
          {searching && (
            <div className="mt-4 flex items-center gap-3 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                <span>Searching across all layers...</span>
              </div>
            </div>
          )}

          {layerInfo && !searching && (
            <div className={`mt-4 flex items-center gap-3 px-4 py-3 border rounded-lg ${layerInfo.color}`}>
              {layerInfo.icon}
              <div>
                <p className="font-medium">Layer {searchLayer} Results</p>
                <p className="text-sm">{layerInfo.text}</p>
              </div>
            </div>
          )}
        </div>

        {/* Search Process Visualization */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Search Process</h3>
          <div className="space-y-3">
            <div className={`flex items-center gap-4 p-3 rounded-lg border ${searchLayer! >= 1 ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${searchLayer! >= 1 ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                1
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">Layer 1: Database Search</p>
                <p className="text-sm text-gray-600">Search your local college database first</p>
              </div>
              <Database className="w-5 h-5 text-gray-400" />
            </div>

            <div className={`flex items-center gap-4 p-3 rounded-lg border ${searchLayer! >= 2 ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${searchLayer! >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                2
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">Layer 2: University Websites</p>
                <p className="text-sm text-gray-600">Scrape official university sites for data</p>
              </div>
              <Globe className="w-5 h-5 text-gray-400" />
            </div>

            <div className={`flex items-center gap-4 p-3 rounded-lg border ${searchLayer === 3 ? 'bg-purple-50 border-purple-300' : 'bg-gray-50 border-gray-200'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${searchLayer === 3 ? 'bg-purple-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                3
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">Layer 3: General Web Search</p>
                <p className="text-sm text-gray-600">Search the entire web for information</p>
              </div>
              <TrendingUp className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {results.length} Results Found
            </h3>
            
            <div className="space-y-4">
              {results.map((result, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition">
                  {/* Database Results */}
                  {searchLayer === 1 && (
                    <>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="text-xl font-bold text-gray-900">{result.name}</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            {result.location} • {result.country}
                          </p>
                          <p className="text-gray-700 mt-2">{result.description}</p>
                          
                          {result.programs && result.programs.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {result.programs.slice(0, 5).map((prog: string, i: number) => (
                                <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                                  {prog}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div className="text-right ml-4">
                          <div className="text-2xl font-bold text-blue-600">
                            {(result.acceptance_rate * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-500">Acceptance</div>
                        </div>
                      </div>
                      
                      {result.website_url && (
                        <a 
                          href={result.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-3 text-blue-600 hover:underline text-sm"
                        >
                          Visit Website →
                        </a>
                      )}
                    </>
                  )}

                  {/* University Website Results */}
                  {searchLayer === 2 && (
                    <>
                      <h4 className="text-lg font-bold text-gray-900">{result.name}</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {result.location} • {result.country}
                      </p>
                      <p className="text-gray-700 mt-2">{result.description}</p>
                      
                      {result.programs && result.programs.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {result.programs.map((prog: string, i: number) => (
                            <span key={i} className="px-3 py-1 bg-green-50 text-green-700 text-xs rounded-full">
                              {prog}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      <a 
                        href={result.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-3 text-blue-600 hover:underline text-sm"
                      >
                        Visit {result.name} →
                      </a>
                    </>
                  )}

                  {/* Web Search Results */}
                  {searchLayer === 3 && (
                    <>
                      <h4 className="text-lg font-bold text-gray-900">{result.title}</h4>
                      {result.category && (
                        <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-xs rounded-full mt-2">
                          {result.category}
                        </span>
                      )}
                      <p className="text-gray-700 mt-2">{result.snippet}</p>
                      
                      {result.url && (
                        <a 
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-3 text-blue-600 hover:underline text-sm"
                        >
                          Read More →
                        </a>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!searching && results.length === 0 && query && (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No results found for "{query}"</p>
            <p className="text-sm text-gray-500 mt-2">
              Searched across all 3 layers: Database, University Sites, and Web
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default IntelligentCollegeSearch;