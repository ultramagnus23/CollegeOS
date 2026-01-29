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
  RefreshCw
} from 'lucide-react';
import api from '../services/api';

/* =========================
   Types
========================= */

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
  // Acceptance rate (stored as decimal 0-1, e.g., 0.09 for 9%)
  acceptance_rate?: number | null;
  acceptanceRate?: number | null;
  // Additional fields for comprehensive display
  tuition_cost?: number | null;
  description?: string | null;
  type?: string | null;
}

interface Layer2Data {
  available: boolean;
  message?: string;
  data?: any;
  source?: string;
  trustTier?: string;
  scrapedAt?: string;
  lastUpdated?: string;
}

interface EligibilityResult {
  status: 'eligible' | 'conditional' | 'not_eligible';
  issues?: Array<{ message: string }>;
  warnings?: Array<{ message: string }>;
  recommendations?: Array<{ message: string }>;
}

/* =========================
   Component
========================= */

const CollegeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [college, setCollege] = useState<College | null>(null);
  const [requirements, setRequirements] = useState<Layer2Data | null>(null);
  const [deadlines, setDeadlines] = useState<Layer2Data | null>(null);
  const [programs, setPrograms] = useState<Layer2Data | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [adding, setAdding] = useState<boolean>(false);
  const [researching, setResearching] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadCollegeDetails(Number(id));
    }
  }, [id]);

  const loadCollegeDetails = async (collegeId: number): Promise<void> => {
    try {
      setLoading(true);
      
      // Layer 1: Core static data
      const response = await api.colleges.getById(collegeId);
      setCollege(response.data);
      
      // Layer 2: Trusted dynamic data (if available)
      await Promise.all([
        loadLayer2Data(collegeId, 'requirements', setRequirements),
        loadLayer2Data(collegeId, 'deadlines', setDeadlines),
        loadLayer2Data(collegeId, 'programs', setPrograms)
      ]);
      
      // Check eligibility if user is authenticated
      try {
        const eligibilityRes = await api.colleges.checkEligibility(collegeId);
        setEligibility(eligibilityRes.data);
      } catch (e) {
        // Eligibility check requires auth - ignore if not logged in
        console.log('Eligibility check skipped (not authenticated)');
      }
      
    } catch (error) {
      console.error('Failed to load college:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLayer2Data = async (
    collegeId: number,
    dataType: string,
    setter: (data: Layer2Data) => void
  ) => {
    try {
      const data = await api.colleges.getCollegeData(collegeId, dataType);
      setter(data);
    } catch (error) {
      // Layer 2 data not available - that's OK, we'll show "Not listed officially"
      setter({
        available: false,
        message: 'Not listed officially'
      });
    }
  };

  const triggerResearch = async (researchType: string) => {
    if (!id || !college) return;
    
    try {
      setResearching(researchType);
      const result = await api.conductResearch(Number(id), researchType, true);
      
      // Reload Layer 2 data after research
      if (researchType === 'requirements') {
        await loadLayer2Data(Number(id), 'requirements', setRequirements);
      } else if (researchType === 'deadlines') {
        await loadLayer2Data(Number(id), 'deadlines', setDeadlines);
      } else if (researchType === 'programs') {
        await loadLayer2Data(Number(id), 'programs', setPrograms);
      }
      
      alert('Research completed! Data updated.');
    } catch (error) {
      console.error('Research failed:', error);
      alert('Research failed. Please try again or visit the official website.');
    } finally {
      setResearching(null);
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
  const majorCategories: string[] = (() => {
    try {
      if (Array.isArray(college.major_categories)) {
        return college.major_categories;
      } else if (typeof college.major_categories === 'string') {
        return JSON.parse(college.major_categories || '[]');
      }
    } catch (e) {
      console.warn('Failed to parse major_categories', e);
    }
    return [];
  })();

  const academicStrengths: string[] = (() => {
    try {
      if (Array.isArray(college.academic_strengths)) {
        return college.academic_strengths;
      } else if (typeof college.academic_strengths === 'string') {
        return JSON.parse(college.academic_strengths || '[]');
      }
    } catch (e) {
      console.warn('Failed to parse academic_strengths', e);
    }
    return [];
  })();
  
  // Parse programs/majors list
  const programsList: string[] = (() => {
    try {
      if (Array.isArray(college.programs)) {
        return college.programs;
      } else if (typeof college.programs === 'string') {
        return JSON.parse(college.programs || '[]');
      }
    } catch (e) {
      console.warn('Failed to parse programs', e);
    }
    return [];
  })();
  
  // Format acceptance rate properly (Issue 2)
  const formatAcceptanceRate = (rate: number | null | undefined): string => {
    if (rate === null || rate === undefined) return 'N/A';
    // If rate is in decimal form (0-1), multiply by 100
    const percentage = rate <= 1 ? rate * 100 : rate;
    return `${percentage.toFixed(1)}%`;
  };
  
  // Format tuition cost
  const formatCurrency = (amount: number | null | undefined, country: string): string => {
    if (amount === null || amount === undefined) return 'Not available';
    if (country === 'India') {
      return `₹${amount.toLocaleString('en-IN')}`;
    } else if (country === 'United Kingdom') {
      return `£${amount.toLocaleString('en-GB')}`;
    } else if (country === 'Germany') {
      return `€${amount.toLocaleString('de-DE')}`;
    }
    return `$${amount.toLocaleString('en-US')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header - Layer 1 Data */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h1 className="text-3xl font-bold">{college.name}</h1>
              <div className="flex items-center text-gray-600 mt-2">
                <MapPin className="w-4 h-4 mr-2" />
                {college.location || 'Location not specified'}, {college.country}
              </div>
              <div className="flex items-center gap-4 mt-4">
                <a
                  href={college.official_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 flex items-center hover:underline"
                >
                  <Globe className="w-4 h-4 mr-1" />
                  Official Website
                  <ExternalLink className="w-4 h-4 ml-1" />
                </a>
                {college.admissions_url && (
                  <a
                    href={college.admissions_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 flex items-center hover:underline"
                  >
                    Admissions Page
                    <ExternalLink className="w-4 h-4 ml-1" />
                  </a>
                )}
              </div>
            </div>

            <button
              onClick={handleAddCollege}
              disabled={adding}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700"
            >
              {adding ? 'Adding…' : 'Add to My List'}
            </button>
          </div>

          {/* Layer 1: Core Facts - Updated to show actual data (Issue 2, 3, 4) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <InfoBox
              icon={<GraduationCap />}
              label="Acceptance Rate"
              value={formatAcceptanceRate(college.acceptance_rate ?? college.acceptanceRate)}
            />
            <InfoBox
              icon={<DollarSign />}
              label="Tuition Cost"
              value={formatCurrency(college.tuition_cost, college.country)}
            />
            <InfoBox
              icon={<CheckCircle />}
              label="Institution Type"
              value={college.type || college.trust_tier || 'Not specified'}
            />
            <InfoBox
              icon={<FileText />}
              label="Programs Offered"
              value={majorCategories.length > 0 ? `${majorCategories.length} programs` : 'Not listed'}
            />
          </div>
        </div>

        {/* SECTION: Programs & Majors (Issue 3, 5) */}
        {(majorCategories.length > 0 || programsList.length > 0) && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <GraduationCap className="w-5 h-5 mr-2" />
              Programs & Majors Offered
            </h2>
            
            {/* Major Categories as Tags */}
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Major Categories:</p>
              <div className="flex flex-wrap gap-2">
                {majorCategories.map((cat, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
            
            {/* Academic Strengths */}
            {academicStrengths.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-600 mb-2">Academic Strengths:</p>
                <div className="flex flex-wrap gap-2">
                  {academicStrengths.map((strength, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm"
                    >
                      {strength}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Programs List (if different from categories) */}
            {programsList.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-600 mb-2">Specific Programs:</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {programsList.slice(0, 20).map((program, i) => (
                    <span key={i} className="text-sm text-gray-700">• {program}</span>
                  ))}
                </div>
                {programsList.length > 20 && (
                  <p className="text-sm text-gray-500 mt-2">
                    And {programsList.length - 20} more programs...
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Layer 2: Trusted Dynamic Data */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Requirements */}
          <DataSection
            title="Entry Requirements"
            icon={<FileText />}
            data={requirements}
            officialUrl={college.admissions_url || college.official_website}
            onResearch={() => triggerResearch('requirements')}
            researching={researching === 'requirements'}
          />

          {/* Deadlines */}
          <DataSection
            title="Application Deadlines"
            icon={<Clock />}
            data={deadlines}
            officialUrl={college.admissions_url || college.official_website}
            onResearch={() => triggerResearch('deadlines')}
            researching={researching === 'deadlines'}
          />

          {/* Programs */}
          <DataSection
            title="Additional Program Info"
            icon={<GraduationCap />}
            data={programs}
            officialUrl={college.programs_url || college.official_website}
            onResearch={() => triggerResearch('programs')}
            researching={researching === 'programs'}
          />

          {/* Eligibility Check */}
          {eligibility && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                Eligibility Check
              </h2>
              <EligibilityBadge status={eligibility.status} />
              {eligibility.issues && eligibility.issues.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-gray-700">Issues:</p>
                  <ul className="list-disc list-inside mt-2 text-sm text-gray-600">
                    {eligibility.issues.map((issue, i) => (
                      <li key={i}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* =========================
   Helper Components
========================= */

interface InfoBoxProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const InfoBox: React.FC<InfoBoxProps> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
    <div className="text-blue-600">{icon}</div>
    <div>
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  </div>
);

interface DataSectionProps {
  title: string;
  icon: React.ReactNode;
  data: Layer2Data | null;
  officialUrl: string;
  onResearch: () => void;
  researching: boolean;
}

const DataSection: React.FC<DataSectionProps> = ({
  title,
  icon,
  data,
  officialUrl,
  onResearch,
  researching
}) => {
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          {icon}
          <span className="ml-2">{title}</span>
        </h2>
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 mb-4">Not listed officially</p>
          <div className="flex flex-col gap-2">
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline flex items-center justify-center"
            >
              Visit Official Website
              <ExternalLink className="w-4 h-4 ml-1" />
            </a>
            <button
              onClick={onResearch}
              disabled={researching}
              className="text-sm text-gray-600 hover:text-blue-600 flex items-center justify-center disabled:opacity-50"
            >
              {researching ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Researching...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Trigger On-Demand Research (Layer 3)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data.available) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          {icon}
          <span className="ml-2">{title}</span>
        </h2>
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-2" />
          <p className="text-gray-600 mb-2">{data.message || 'Not listed officially'}</p>
          {data.lastUpdated && (
            <p className="text-xs text-gray-500 mb-4">Last updated: {new Date(data.lastUpdated).toLocaleDateString()}</p>
          )}
          <div className="flex flex-col gap-2">
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline flex items-center justify-center"
            >
              Visit Official Website
              <ExternalLink className="w-4 h-4 ml-1" />
            </a>
            <button
              onClick={onResearch}
              disabled={researching}
              className="text-sm text-gray-600 hover:text-blue-600 flex items-center justify-center disabled:opacity-50"
            >
              {researching ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Researching...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Trigger On-Demand Research (Layer 3)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold flex items-center">
          {icon}
          <span className="ml-2">{title}</span>
        </h2>
        {data.source && (
          <a
            href={data.source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center"
          >
            Source
            <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        )}
      </div>
      
      {data.data && (
        <div className="space-y-2">
          {typeof data.data === 'object' ? (
            <pre className="text-sm bg-gray-50 p-4 rounded overflow-auto">
              {JSON.stringify(data.data, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-gray-700">{String(data.data)}</p>
          )}
        </div>
      )}
      
      {data.scrapedAt && (
        <p className="text-xs text-gray-500 mt-4">
          Scraped: {new Date(data.scrapedAt).toLocaleString()}
          {data.trustTier && ` • Trust Tier: ${data.trustTier}`}
        </p>
      )}
      
      <button
        onClick={onResearch}
        disabled={researching}
        className="mt-4 text-sm text-gray-600 hover:text-blue-600 flex items-center disabled:opacity-50"
      >
        {researching ? (
          <>
            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
            Refreshing...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh Data (Layer 3)
          </>
        )}
      </button>
    </div>
  );
};

interface EligibilityBadgeProps {
  status: 'eligible' | 'conditional' | 'not_eligible';
}

const EligibilityBadge: React.FC<EligibilityBadgeProps> = ({ status }) => {
  const config = {
    eligible: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      icon: <CheckCircle className="w-5 h-5" />,
      label: 'Eligible'
    },
    conditional: {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      icon: <AlertCircle className="w-5 h-5" />,
      label: 'Conditionally Eligible'
    },
    not_eligible: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      icon: <AlertCircle className="w-5 h-5" />,
      label: 'Not Eligible'
    }
  };

  const { bg, text, icon, label } = config[status];

  return (
    <div className={`flex items-center gap-2 p-4 rounded-lg ${bg}`}>
      <div className={text}>{icon}</div>
      <span className={`font-semibold ${text}`}>{label}</span>
    </div>
  );
};

export default CollegeDetail;
