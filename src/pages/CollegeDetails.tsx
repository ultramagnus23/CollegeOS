import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Globe,
  MapPin,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  GraduationCap,
  DollarSign,
  RefreshCw,
  Users,
  Award,
  TrendingUp,
  Building,
  Calendar,
  BookOpen,
  Briefcase,
  Home,
  BarChart2
} from 'lucide-react';
import api from '../services/api';

/* =========================
   Types
========================= */

interface TestScores {
  satRange?: { percentile25: number; percentile75: number } | null;
  actRange?: { percentile25: number; percentile75: number } | null;
  averageGPA?: number | null;
}

interface GraduationRates {
  fourYear?: number;
  sixYear?: number;
}

interface Placements {
  averagePackage?: number;
  highestPackage?: number;
  placementRate?: number;
}

interface College {
  id: number;
  name: string;
  country: string;
  location?: string;
  official_website: string;
  admissions_url?: string;
  programs_url?: string;
  application_portal_url?: string;
  academic_strengths?: string[] | string;
  major_categories?: string[] | string;
  programs?: string[] | string;
  trust_tier?: string;
  is_verified?: number;
  acceptance_rate?: number | null;
  acceptanceRate?: number | null;
  tuition_cost?: number | null;
  description?: string | null;
  type?: string | null;
  enrollment?: number | null;
  ranking?: number | null;
  testScores?: TestScores;
  graduationRates?: GraduationRates | null;
  studentFacultyRatio?: string | null;
  deadlineTemplates?: Record<string, { date: string; type: string }>;
  requirements?: Record<string, any>;
  // Country-specific fields
  placements?: Placements | null;
  cutoffs?: Record<string, any> | null;
  entranceExam?: string | null;
  nirfRank?: number | null;
  russellGroup?: boolean;
  aLevelRequirements?: string | null;
  ibPointsRequired?: string | null;
  qsRank?: number | null;
  abiturRequirement?: string | null;
  germanLevel?: string | null;
  englishLevel?: string | null;
}

type TabName = 'overview' | 'admissions' | 'academics' | 'cost' | 'studentLife' | 'outcomes';

/* =========================
   Component
========================= */

const CollegeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [college, setCollege] = useState<College | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [adding, setAdding] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabName>('overview');

  useEffect(() => {
    if (id) {
      loadCollegeDetails(Number(id));
    }
  }, [id]);

  const loadCollegeDetails = async (collegeId: number): Promise<void> => {
    try {
      setLoading(true);
      const response = await api.colleges.getById(collegeId);
      setCollege(response.data);
    } catch (error) {
      console.error('Failed to load college:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCollege = async (): Promise<void> => {
    if (!college) return;

    try {
      setAdding(true);
      await api.applications.create({
        college_id: college.id,
        application_type: 'regular'
      });
      alert('College added successfully!');
      navigate('/applications');
    } catch (error: unknown) {
      alert(
        error instanceof Error
          ? error.message
          : 'Failed to add college'
      );
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!college) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 text-center">
        <h1 className="text-2xl font-bold mb-4">College Not Found</h1>
        <button
          onClick={() => navigate('/colleges')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg"
        >
          Back to Colleges
        </button>
      </div>
    );
  }

  // Parse JSON fields safely
  const parseArray = (data: string[] | string | undefined): string[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  };

  const majorCategories = parseArray(college.major_categories);
  const academicStrengths = parseArray(college.academic_strengths);
  const programs = parseArray(college.programs);

  // Format helpers
  const formatAcceptanceRate = (rate: number | null | undefined): string => {
    if (rate === null || rate === undefined) return 'N/A';
    const percentage = rate <= 1 ? rate * 100 : rate;
    return `${percentage.toFixed(1)}%`;
  };

  const formatCurrency = (amount: number | null | undefined, country: string): string => {
    if (amount === null || amount === undefined) return 'Not available';
    if (country === 'India') {
      return `₹${amount.toLocaleString('en-IN')}`;
    } else if (country === 'United Kingdom') {
      return `£${amount.toLocaleString('en-GB')}`;
    } else if (country === 'Germany') {
      return amount === 0 ? 'Free (Public)' : `€${amount.toLocaleString('de-DE')}`;
    }
    return `$${amount.toLocaleString('en-US')}`;
  };

  const formatEnrollment = (num: number | null | undefined): string => {
    if (!num) return 'N/A';
    return num.toLocaleString();
  };

  const acceptanceRate = college.acceptanceRate ?? college.acceptance_rate;
  const testScores = college.testScores || {};

  const tabs: { id: TabName; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Building className="w-4 h-4" /> },
    { id: 'admissions', label: 'Admissions', icon: <FileText className="w-4 h-4" /> },
    { id: 'academics', label: 'Academics', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'cost', label: 'Cost & Aid', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'studentLife', label: 'Student Life', icon: <Users className="w-4 h-4" /> },
    { id: 'outcomes', label: 'Outcomes', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <button
            onClick={() => navigate('/colleges')}
            className="text-blue-200 hover:text-white mb-4 text-sm flex items-center gap-1"
          >
            ← Back to Colleges
          </button>
          
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {college.ranking && (
                  <span className="bg-yellow-400 text-yellow-900 text-sm font-bold px-3 py-1 rounded-full">
                    #{college.ranking}
                  </span>
                )}
                {college.is_verified ? (
                  <span className="bg-green-400/20 text-green-100 text-xs px-2 py-0.5 rounded flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Verified
                  </span>
                ) : null}
              </div>
              
              <h1 className="text-4xl font-bold mb-2">{college.name}</h1>
              
              <div className="flex items-center gap-4 text-blue-100">
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {college.location || 'Location not specified'}, {college.country}
                </div>
                <span className="px-2 py-0.5 bg-white/20 rounded text-sm">
                  {college.type || 'University'}
                </span>
              </div>

              <div className="flex items-center gap-4 mt-4">
                <a
                  href={college.official_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white flex items-center gap-1 hover:underline"
                >
                  <Globe className="w-4 h-4" />
                  Official Website
                  <ExternalLink className="w-3 h-3" />
                </a>
                {college.admissions_url && (
                  <a
                    href={college.admissions_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white flex items-center gap-1 hover:underline"
                  >
                    Admissions
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            <button
              onClick={handleAddCollege}
              disabled={adding}
              className="px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold disabled:opacity-50 hover:bg-blue-50 transition-colors"
            >
              {adding ? 'Adding…' : '+ Add to My List'}
            </button>
          </div>

          {/* Quick Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8 bg-white/10 rounded-xl p-4">
            <QuickStat label="Acceptance Rate" value={formatAcceptanceRate(acceptanceRate)} />
            <QuickStat label="Enrollment" value={formatEnrollment(college.enrollment)} />
            <QuickStat label="Tuition" value={formatCurrency(college.tuition_cost, college.country)} />
            <QuickStat label="Avg GPA" value={testScores.averageGPA?.toFixed(2) || 'N/A'} />
            <QuickStat label="Student:Faculty" value={college.studentFacultyRatio || 'N/A'} />
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Description */}
              {college.description && (
                <Card title="About">
                  <p className="text-gray-700 leading-relaxed">{college.description}</p>
                </Card>
              )}

              {/* Key Stats */}
              <Card title="Key Statistics">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <StatItem label="Acceptance Rate" value={formatAcceptanceRate(acceptanceRate)} icon={<TrendingUp />} />
                  <StatItem label="Total Enrollment" value={formatEnrollment(college.enrollment)} icon={<Users />} />
                  <StatItem label="Student:Faculty Ratio" value={college.studentFacultyRatio || 'N/A'} icon={<GraduationCap />} />
                  {college.graduationRates?.fourYear && (
                    <StatItem label="4-Year Grad Rate" value={`${college.graduationRates.fourYear}%`} icon={<Award />} />
                  )}
                  {college.graduationRates?.sixYear && (
                    <StatItem label="6-Year Grad Rate" value={`${college.graduationRates.sixYear}%`} icon={<Award />} />
                  )}
                  <StatItem label="Institution Type" value={college.type || 'University'} icon={<Building />} />
                </div>
              </Card>

              {/* Academic Strengths */}
              {academicStrengths.length > 0 && (
                <Card title="Academic Strengths">
                  <div className="flex flex-wrap gap-2">
                    {academicStrengths.map((strength, i) => (
                      <span key={i} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium">
                        ⭐ {strength}
                      </span>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Links */}
              <Card title="Quick Links">
                <div className="space-y-2">
                  <QuickLink href={college.official_website} label="Official Website" />
                  {college.admissions_url && <QuickLink href={college.admissions_url} label="Admissions Page" />}
                  {college.programs_url && <QuickLink href={college.programs_url} label="Programs & Majors" />}
                  {college.application_portal_url && <QuickLink href={college.application_portal_url} label="Apply Now" />}
                </div>
              </Card>

              {/* Location */}
              <Card title="Location">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="font-medium">{college.location || college.country}</p>
                    <p className="text-sm text-gray-600">{college.country}</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Admissions Tab */}
        {activeTab === 'admissions' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Acceptance Rate */}
              <Card title="Acceptance Rate">
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-blue-600">{formatAcceptanceRate(acceptanceRate)}</div>
                    <p className="text-gray-600 text-sm mt-1">Overall Acceptance Rate</p>
                  </div>
                  <div className="flex-1">
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div 
                        className="bg-blue-600 h-4 rounded-full" 
                        style={{ width: `${Math.min((acceptanceRate || 0) * (acceptanceRate && acceptanceRate <= 1 ? 100 : 1), 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Test Scores */}
              <Card title="Test Score Ranges (Middle 50%)">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {testScores.satRange && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">SAT</h4>
                      <div className="space-y-2">
                        <ScoreBar label="Total" low={testScores.satRange.percentile25} high={testScores.satRange.percentile75} max={1600} />
                      </div>
                    </div>
                  )}
                  {testScores.actRange && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">ACT</h4>
                      <div className="space-y-2">
                        <ScoreBar label="Composite" low={testScores.actRange.percentile25} high={testScores.actRange.percentile75} max={36} />
                      </div>
                    </div>
                  )}
                  {!testScores.satRange && !testScores.actRange && (
                    <p className="text-gray-600">Test score data not available</p>
                  )}
                </div>
                {testScores.averageGPA && (
                  <div className="mt-6 pt-6 border-t">
                    <h4 className="font-medium text-gray-900 mb-2">Average GPA</h4>
                    <div className="text-3xl font-bold text-blue-600">{testScores.averageGPA.toFixed(2)}</div>
                  </div>
                )}
              </Card>

              {/* Application Deadlines */}
              {college.deadlineTemplates && Object.keys(college.deadlineTemplates).length > 0 && (
                <Card title="Application Deadlines">
                  <div className="space-y-3">
                    {Object.entries(college.deadlineTemplates).map(([key, deadline]) => (
                      <div key={key} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Calendar className="w-5 h-5 text-blue-600" />
                          <span className="font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                        </div>
                        <span className="text-gray-700">{deadline.date}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Country-Specific: India */}
              {college.country === 'India' && (
                <>
                  {college.entranceExam && (
                    <Card title="Entrance Exam">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-orange-50 rounded-lg">
                          <FileText className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-lg">{college.entranceExam}</p>
                          {college.cutoffs && (
                            <p className="text-sm text-gray-600">Cutoff data available</p>
                          )}
                        </div>
                      </div>
                    </Card>
                  )}
                </>
              )}

              {/* Country-Specific: UK */}
              {college.country === 'United Kingdom' && (
                <Card title="Entry Requirements">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {college.aLevelRequirements && (
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <p className="text-sm text-purple-600 font-medium">A-Level Requirements</p>
                        <p className="text-lg font-semibold">{college.aLevelRequirements}</p>
                      </div>
                    )}
                    {college.ibPointsRequired && (
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-600 font-medium">IB Points</p>
                        <p className="text-lg font-semibold">{college.ibPointsRequired}</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Country-Specific: Germany */}
              {college.country === 'Germany' && (
                <Card title="Entry Requirements">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {college.abiturRequirement && (
                      <div className="p-4 bg-yellow-50 rounded-lg">
                        <p className="text-sm text-yellow-700 font-medium">Abitur Grade</p>
                        <p className="text-lg font-semibold">{college.abiturRequirement}</p>
                      </div>
                    )}
                    {college.germanLevel && (
                      <div className="p-4 bg-red-50 rounded-lg">
                        <p className="text-sm text-red-600 font-medium">German Level</p>
                        <p className="text-lg font-semibold">{college.germanLevel}</p>
                      </div>
                    )}
                    {college.englishLevel && (
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-600 font-medium">English Level</p>
                        <p className="text-lg font-semibold">{college.englishLevel}</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card title="Application Portal">
                {college.application_portal_url && (
                  <a
                    href={college.application_portal_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3 bg-blue-600 text-white text-center rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    Apply Now →
                  </a>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* Academics Tab */}
        {activeTab === 'academics' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Major Categories */}
              <Card title="Major Categories">
                <div className="flex flex-wrap gap-2">
                  {majorCategories.length > 0 ? (
                    majorCategories.map((cat, i) => (
                      <span key={i} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium">
                        {cat}
                      </span>
                    ))
                  ) : (
                    <p className="text-gray-600">Major categories not listed</p>
                  )}
                </div>
              </Card>

              {/* Programs/Majors */}
              <Card title="Programs Offered">
                {programs.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {programs.map((program, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
                        <BookOpen className="w-4 h-4 text-gray-400" />
                        <span>{program}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600">
                    Specific programs not listed.{' '}
                    <a href={college.programs_url || college.official_website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      View on official website →
                    </a>
                  </p>
                )}
              </Card>

              {/* Academic Stats */}
              <Card title="Academic Statistics">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900">{college.studentFacultyRatio || 'N/A'}</div>
                    <p className="text-sm text-gray-600">Student:Faculty</p>
                  </div>
                  {college.graduationRates?.fourYear && (
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{college.graduationRates.fourYear}%</div>
                      <p className="text-sm text-gray-600">4-Year Grad Rate</p>
                    </div>
                  )}
                  {college.graduationRates?.sixYear && (
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{college.graduationRates.sixYear}%</div>
                      <p className="text-sm text-gray-600">6-Year Grad Rate</p>
                    </div>
                  )}
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{majorCategories.length}</div>
                    <p className="text-sm text-gray-600">Major Categories</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {academicStrengths.length > 0 && (
                <Card title="Academic Strengths">
                  <div className="space-y-2">
                    {academicStrengths.map((strength, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-green-50 rounded">
                        <Award className="w-4 h-4 text-green-600" />
                        <span className="text-green-700 font-medium">{strength}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Cost & Aid Tab */}
        {activeTab === 'cost' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card title="Tuition & Costs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-blue-50 rounded-xl text-center">
                    <DollarSign className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                    <div className="text-3xl font-bold text-blue-600">
                      {formatCurrency(college.tuition_cost, college.country)}
                    </div>
                    <p className="text-blue-700 mt-1">Annual Tuition</p>
                  </div>
                  {college.country === 'Germany' && college.tuition_cost === 0 && (
                    <div className="p-6 bg-green-50 rounded-xl text-center">
                      <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                      <div className="text-3xl font-bold text-green-600">Free</div>
                      <p className="text-green-700 mt-1">Public University</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* India-specific: Placements */}
              {college.country === 'India' && college.placements && (
                <Card title="Placement Statistics">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {college.placements.averagePackage && (
                      <div className="p-4 bg-green-50 rounded-lg text-center">
                        <div className="text-2xl font-bold text-green-600">
                          ₹{(college.placements.averagePackage / 100000).toFixed(1)} LPA
                        </div>
                        <p className="text-sm text-green-700">Average Package</p>
                      </div>
                    )}
                    {college.placements.highestPackage && (
                      <div className="p-4 bg-blue-50 rounded-lg text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          ₹{(college.placements.highestPackage / 100000).toFixed(1)} LPA
                        </div>
                        <p className="text-sm text-blue-700">Highest Package</p>
                      </div>
                    )}
                    {college.placements.placementRate && (
                      <div className="p-4 bg-purple-50 rounded-lg text-center">
                        <div className="text-2xl font-bold text-purple-600">
                          {college.placements.placementRate}%
                        </div>
                        <p className="text-sm text-purple-700">Placement Rate</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card title="Financial Aid">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-600">
                    Financial aid information available on the official website
                  </p>
                  <a
                    href={college.official_website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-sm mt-2 inline-block"
                  >
                    View Financial Aid →
                  </a>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Student Life Tab */}
        {activeTab === 'studentLife' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card title="Campus Overview">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <StatItem label="Total Students" value={formatEnrollment(college.enrollment)} icon={<Users />} />
                  <StatItem label="Location" value={college.location || college.country} icon={<MapPin />} />
                  <StatItem label="Type" value={college.type || 'University'} icon={<Building />} />
                </div>
              </Card>

              {college.country === 'United Kingdom' && college.russellGroup && (
                <Card title="Affiliations">
                  <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg">
                    <Award className="w-6 h-6 text-purple-600" />
                    <div>
                      <p className="font-semibold text-purple-900">Russell Group Member</p>
                      <p className="text-sm text-purple-700">One of the UK's leading research universities</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card title="Campus Life">
                <p className="text-gray-600 text-center p-4">
                  For detailed information about campus life, clubs, and activities, visit the official website.
                </p>
                <a
                  href={college.official_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-2 border border-gray-200 text-center rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Explore Campus Life →
                </a>
              </Card>
            </div>
          </div>
        )}

        {/* Outcomes Tab */}
        {activeTab === 'outcomes' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card title="Graduation Rates">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {college.graduationRates?.fourYear && (
                    <div className="text-center">
                      <div className="relative w-32 h-32 mx-auto">
                        <svg className="w-full h-full" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="45" fill="none" stroke="#E5E7EB" strokeWidth="10" />
                          <circle 
                            cx="50" cy="50" r="45" fill="none" stroke="#10B981" strokeWidth="10"
                            strokeDasharray={`${college.graduationRates.fourYear * 2.83} 283`}
                            strokeLinecap="round"
                            transform="rotate(-90 50 50)"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-bold">{college.graduationRates.fourYear}%</span>
                        </div>
                      </div>
                      <p className="mt-2 font-medium">4-Year Graduation Rate</p>
                    </div>
                  )}
                  {college.graduationRates?.sixYear && (
                    <div className="text-center">
                      <div className="relative w-32 h-32 mx-auto">
                        <svg className="w-full h-full" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="45" fill="none" stroke="#E5E7EB" strokeWidth="10" />
                          <circle 
                            cx="50" cy="50" r="45" fill="none" stroke="#3B82F6" strokeWidth="10"
                            strokeDasharray={`${college.graduationRates.sixYear * 2.83} 283`}
                            strokeLinecap="round"
                            transform="rotate(-90 50 50)"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-bold">{college.graduationRates.sixYear}%</span>
                        </div>
                      </div>
                      <p className="mt-2 font-medium">6-Year Graduation Rate</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* India-specific: Placements in Outcomes */}
              {college.country === 'India' && college.placements && (
                <Card title="Career Outcomes">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                      <Briefcase className="w-8 h-8 text-blue-600" />
                      <div>
                        <p className="font-semibold">Strong Placement Record</p>
                        <p className="text-sm text-gray-600">Top companies recruit from this institution</p>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card title="Career Services">
                <p className="text-gray-600 text-sm">
                  Contact the career services office for detailed employment statistics and outcomes data.
                </p>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* =========================
   Helper Components
========================= */

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
    <div className="p-4 border-b border-gray-100">
      <h3 className="font-semibold text-gray-900">{title}</h3>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const QuickStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="text-center">
    <div className="text-xl font-bold">{value}</div>
    <div className="text-xs text-blue-200">{label}</div>
  </div>
);

const StatItem: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
    <div className="p-2 bg-white rounded-lg text-blue-600">{icon}</div>
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900">{value}</p>
    </div>
  </div>
);

const QuickLink: React.FC<{ href: string; label: string }> = ({ href, label }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
  >
    <span className="text-gray-700">{label}</span>
    <ExternalLink className="w-4 h-4 text-gray-400" />
  </a>
);

const ScoreBar: React.FC<{ label: string; low: number; high: number; max: number }> = ({ label, low, high, max }) => {
  const lowPercent = (low / max) * 100;
  const highPercent = (high / max) * 100;
  const rangeWidth = highPercent - lowPercent;
  
  return (
    <div>
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{label}</span>
        <span className="font-medium">{low} - {high}</span>
      </div>
      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className="absolute h-full bg-blue-500 rounded-full"
          style={{ left: `${lowPercent}%`, width: `${rangeWidth}%` }}
        />
      </div>
    </div>
  );
};

export default CollegeDetail;
