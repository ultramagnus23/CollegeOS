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
        // Backend returns colleges array for college-type queries
        const collegeResults = response.colleges || response.results || response.data || [];
        setResults(collegeResults);
        // Default to layer 1 (database search) since that's what our backend uses
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
          color: 'bg-primary/15 text-blue-800 border-blue-300'
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
    <div className="min-h-screen bg-muted/50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-card rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Layers className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">3-Layer Intelligent Search</h1>
              <p className="text-sm text-muted-foreground">Database → University Sites → Web Search</p>
              {studentProfile && (
                <p className="text-xs text-primary mt-1">
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
              className="flex-1 px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              onClick={performSearch}
              disabled={searching || !query.trim()}
              className="px-8 py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-2"
            >
              <Search className="w-5 h-5" />
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Layer Indicator */}
          {searching && (
            <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
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
        <div className="bg-card rounded-lg shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-foreground mb-4">Search Process</h3>
          <div className="space-y-3">
            <div className={`flex items-center gap-4 p-3 rounded-lg border ${searchLayer! >= 1 ? 'bg-green-50 border-green-300' : 'bg-muted/50 border-border'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${searchLayer! >= 1 ? 'bg-green-600 text-white' : 'bg-gray-300 text-muted-foreground'}`}>
                1
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Layer 1: Database Search</p>
                <p className="text-sm text-muted-foreground">Search your local college database first</p>
              </div>
              <Database className="w-5 h-5 text-muted-foreground" />
            </div>

            <div className={`flex items-center gap-4 p-3 rounded-lg border ${searchLayer! >= 2 ? 'bg-primary/10 border-blue-300' : 'bg-muted/50 border-border'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${searchLayer! >= 2 ? 'bg-primary text-white' : 'bg-gray-300 text-muted-foreground'}`}>
                2
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Layer 2: University Websites</p>
                <p className="text-sm text-muted-foreground">Scrape official university sites for data</p>
              </div>
              <Globe className="w-5 h-5 text-muted-foreground" />
            </div>

            <div className={`flex items-center gap-4 p-3 rounded-lg border ${searchLayer === 3 ? 'bg-purple-50 border-purple-300' : 'bg-muted/50 border-border'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${searchLayer === 3 ? 'bg-purple-600 text-white' : 'bg-gray-300 text-muted-foreground'}`}>
                3
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Layer 3: General Web Search</p>
                <p className="text-sm text-muted-foreground">Search the entire web for information</p>
              </div>
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-card rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {results.length} Results Found
            </h3>
            
            <div className="space-y-4">
              {results.map((result, index) => {
                // Extract common fields with fallbacks for different API response formats
                const acceptanceRate = result.acceptanceRate || result.acceptance_rate;
                const websiteUrl = result.officialWebsite || result.website_url;
                
                return (
                <div key={index} className="border border-border rounded-lg p-5 hover:shadow-md transition">
                  {/* Database Results */}
                  {searchLayer === 1 && (
                    <>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="text-xl font-bold text-foreground">{result.name}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {result.location} • {result.country}
                          </p>
                          <p className="text-foreground mt-2">{result.description}</p>
                          
                          {result.programs && result.programs.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {result.programs.slice(0, 5).map((prog: string, i: number) => (
                                <span key={i} className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full">
                                  {prog}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div className="text-right ml-4">
                          {acceptanceRate && (
                            <>
                              <div className="text-2xl font-bold text-primary">
                                {(acceptanceRate * 100).toFixed(1)}%
                              </div>
                              <div className="text-xs text-muted-foreground">Acceptance</div>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {websiteUrl && (
                        <a 
                          href={websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-3 text-primary hover:underline text-sm"
                        >
                          Visit Website →
                        </a>
                      )}
                    </>
                  )}

                  {/* University Website Results */}
                  {searchLayer === 2 && (
                    <>
                      <h4 className="text-lg font-bold text-foreground">{result.name}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {result.location} • {result.country}
                      </p>
                      <p className="text-foreground mt-2">{result.description}</p>
                      
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
                        className="inline-block mt-3 text-primary hover:underline text-sm"
                      >
                        Visit {result.name} →
                      </a>
                    </>
                  )}

                  {/* Web Search Results */}
                  {searchLayer === 3 && (
                    <>
                      <h4 className="text-lg font-bold text-foreground">{result.title}</h4>
                      {result.category && (
                        <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-xs rounded-full mt-2">
                          {result.category}
                        </span>
                      )}
                      <p className="text-foreground mt-2">{result.snippet}</p>
                      
                      {result.url && (
                        <a 
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-3 text-primary hover:underline text-sm"
                        >
                          Read More →
                        </a>
                      )}
                    </>
                  )}
                </div>
              );})}
            </div>
          </div>
        )}

        {!searching && results.length === 0 && query && (
          <div className="bg-card rounded-lg shadow-sm p-12 text-center">
            <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No results found for "{query}"</p>
            <p className="text-sm text-muted-foreground mt-2">
              Searched across all 3 layers: Database, University Sites, and Web
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default IntelligentCollegeSearch;