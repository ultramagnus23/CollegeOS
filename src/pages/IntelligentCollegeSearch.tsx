import React, { useState, useEffect } from 'react';
import { Search, Sparkles, MessageCircle, Target, TrendingUp, Award, DollarSign, MapPin } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

// --- Interfaces & Types ---

interface StudentProfile {
  name?: string;
  potentialMajors?: string[];
  skillsStrengths?: string[];
  grade?: string | number;
  country?: string;
  subjects?: string[];
  currentBoard?: string;
}

interface ResearchData {
  avg_cost?: number;
  aid_available?: boolean;
  indian_students?: number;
  [key: string]: any;
}

interface College {
  id?: string | number;
  name: string;
  country: string;
  location: string;
  type?: string;
  acceptance_rate: number;
  programs?: string[];
  description?: string;
  website_url?: string;
  logo_url?: string | null;
  matchScore?: number; // Added this as it appears in your rendering logic
  research_data?: ResearchData;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  studentProfile: StudentProfile;
}

interface SearchResponse {
  success: boolean;
  results: College[];
  understood?: Record<string, any>;
}

interface MatchResponse {
  success: boolean;
  matches: College[];
  analysis: string;
}

interface CounselorResponse {
  success: boolean;
  guidance?: string;
  advice?: string;
  opportunities?: string;
}

// --- Component ---

const IntelligentCollegeSearch: React.FC<Props> = ({ studentProfile }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  
  // Counselor State
  const [showCounselor, setShowCounselor] = useState<boolean>(false);
  const [counselorMessages, setCounselorMessages] = useState<Message[]>([]);
  const [counselorInput, setCounselorInput] = useState<string>('');

  // Get AI-matched colleges on load
  useEffect(() => {
    if (studentProfile && studentProfile.name) {
      getAIMatches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentProfile]);

  const getAIMatches = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/counselor/match-colleges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentProfile })
      });

      const data: MatchResponse = await response.json();
      if (data.success) {
        setColleges(data.matches);
        setAiAnalysis(data.analysis);
      }
    } catch (error) {
      console.error('AI matching failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const intelligentSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/counselor/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          studentProfile: studentProfile
        })
      });

      const data: SearchResponse = await response.json();
      if (data.success) {
        setColleges(data.results);
        
        // Show what the AI understood
        if (data.understood) {
          setAiAnalysis(`I understood you're looking for: ${JSON.stringify(data.understood, null, 2)}`);
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const askCounselor = async (question: string) => {
    // Add user message immediately
    setCounselorMessages(prev => [...prev, { role: 'user', content: question }]);
    setCounselorInput('');

    try {
      // Intelligent routing based on question type
      let endpoint = '/counselor/major-guidance';
      let body: any = { studentProfile, question };

      const lowerQuestion = question.toLowerCase();

      if (lowerQuestion.includes('major') || lowerQuestion.includes('degree')) {
        endpoint = '/counselor/major-guidance';
        body = {
          studentProfile,
          potentialMajors: studentProfile.potentialMajors || [],
          skills: studentProfile.skillsStrengths || [],
          interests: question
        };
      } else if (lowerQuestion.includes('competition') || lowerQuestion.includes('internship')) {
        endpoint = '/counselor/opportunities';
        body = {
          major: studentProfile.potentialMajors?.[0] || 'Computer Science',
          grade: studentProfile.grade,
          interests: studentProfile.skillsStrengths || [],
          location: studentProfile.country
        };
      } else if (lowerQuestion.includes('subject')) {
        endpoint = '/counselor/subject-selection';
        body = {
          currentSubjects: studentProfile.subjects || [],
          intendedMajor: studentProfile.potentialMajors?.[0],
          targetColleges: colleges.slice(0, 5).map(c => c.name),
          board: studentProfile.currentBoard
        };
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data: CounselorResponse = await response.json();
      
      if (data.success) {
        const answer = data.guidance || data.advice || data.opportunities || 'I can help with that!';
        setCounselorMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      }
    } catch (error) {
      console.error('Counselor error:', error);
      setCounselorMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm here to help! Ask me about majors, colleges, requirements, or your roadmap."
      }]);
    }
  };

  const getMatchCategory = (score: number | undefined): { label: string; color: string } => {
    const s = score || 0;
    if (s >= 80) return { label: 'Safety', color: 'green' };
    if (s >= 60) return { label: 'Target', color: 'blue' };
    return { label: 'Reach', color: 'orange' };
  };

  // Event Handlers
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') intelligentSearch();
  };

  const handleCounselorInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && counselorInput.trim()) {
      askCounselor(counselorInput);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Hi {studentProfile?.name || 'there'}! 👋
              </h1>
              <p className="text-gray-600 mt-1">
                AI-powered college matches based on your profile
              </p>
            </div>
            <button
              onClick={() => setShowCounselor(!showCounselor)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition"
            >
              <MessageCircle className="w-5 h-5" />
              AI Counselor
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Intelligent Search Bar */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Natural Language Search</h2>
          </div>
          
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyPress={handleSearchKeyPress}
                className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
                placeholder="Try: 'small colleges with good CS programs and over 10% acceptance' or 'affordable engineering schools in Canada'"
              />
            </div>
            <button
              onClick={intelligentSearch}
              disabled={loading}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:shadow-lg transition disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-sm text-gray-600">Try:</span>
            {['affordable CS colleges', 'small liberal arts', 'UK universities under £30k', 'engineering with co-op'].map(ex => (
              <button
                key={ex}
                onClick={() => { setSearchQuery(ex); }}
                className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* AI Analysis */}
        {aiAnalysis && (
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <Sparkles className="w-6 h-6 text-purple-600 mt-1 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-2">AI Analysis</h3>
                <p className="text-gray-700 whitespace-pre-line">{aiAnalysis}</p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {loading ? 'Finding matches...' : `${colleges.length} Colleges Matched`}
            </h2>
            {colleges.length > 0 && (
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-gray-600">Safety</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span className="text-gray-600">Target</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                  <span className="text-gray-600">Reach</span>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 text-gray-600">Using AI to find your perfect matches...</p>
            </div>
          ) : colleges.length > 0 ? (
            <div className="space-y-4">
              {colleges.map((college, index) => {
                const category = getMatchCategory(college.matchScore);
                return (
                  <div
                    key={college.id || index}
                    className={`border-l-4 border-${category.color}-500 bg-white rounded-lg p-6 hover:shadow-md transition`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold text-gray-900">{college.name}</h3>
                          <span className={`px-3 py-1 bg-${category.color}-100 text-${category.color}-700 text-sm font-medium rounded-full`}>
                            {category.label}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {college.location}, {college.country}
                          </div>
                          <div className="flex items-center gap-1">
                            <Target className="w-4 h-4" />
                            {(college.acceptance_rate * 100).toFixed(1)}% acceptance
                          </div>
                          {college.research_data && (
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4" />
                              ${college.research_data.avg_cost?.toLocaleString()}/year
                            </div>
                          )}
                        </div>

                        <p className="text-gray-700 mb-3">{college.description}</p>

                        <div className="flex flex-wrap gap-2">
                          {college.programs?.slice(0, 5).map((prog, i) => (
                            <span key={i} className="px-3 py-1 bg-purple-50 text-purple-700 text-xs rounded-full">
                              {prog}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="text-right ml-6">
                        <div className="text-3xl font-bold text-purple-600">
                          {college.matchScore}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Match Score</div>
                        <button className="mt-4 px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium transition">
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Search className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Complete your profile to see AI-matched colleges!</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Counselor Sidebar */}
      {showCounselor && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl flex flex-col z-50">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">AI Counselor</h3>
                <p className="text-sm opacity-90">Your personal college advisor</p>
              </div>
              <button
                onClick={() => setShowCounselor(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {counselorMessages.length === 0 && (
              <div className="text-center text-gray-500 mt-8">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm mb-4">Ask me anything about:</p>
                <div className="space-y-2 text-left">
                  {[
                    'Which major should I choose?',
                    'What competitions should I do?',
                    'Which subjects to take?',
                    'How to stand out in applications?',
                    'Create my personalized roadmap'
                  ].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => askCounselor(q)}
                      className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {counselorMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-4 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="text-sm whitespace-pre-line">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={counselorInput}
                onChange={(e) => setCounselorInput(e.target.value)}
                onKeyPress={handleCounselorInputKeyPress}
                placeholder="Ask about majors, colleges, requirements..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
              />
              <button
                onClick={() => counselorInput.trim() && askCounselor(counselorInput)}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntelligentCollegeSearch;