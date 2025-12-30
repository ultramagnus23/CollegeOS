import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Globe,
  MapPin,
  DollarSign,
  Users,
  BookOpen,
  CheckCircle,
  AlertCircle,
  XCircle,
  ExternalLink,
  Award,
  TrendingUp
} from 'lucide-react';
import api from '../services/api';

/* =========================
   Types
========================= */

type EligibilityStatus = 'eligible' | 'conditional' | 'not_eligible';

interface EligibilityMessage {
  message: string;
}

interface EligibilityResult {
  status: EligibilityStatus;
  issues?: EligibilityMessage[];
  warnings?: EligibilityMessage[];
  recommendations?: EligibilityMessage[];
}

interface CollegeRequirements {
  accepted_boards?: string[];
  required_subjects?: string[];
  optional_exams?: string[];
  language_exams?: string[];
  min_percentage?: number;
}

interface ResearchData {
  avg_cost?: number;
  indian_students?: number;
  aid_available?: boolean;
}

interface College {
  id: number;
  name: string;
  location: string;
  country: string;
  description: string;
  website_url?: string;
  acceptance_rate?: number;
  type: string;
  application_portal: string;
  programs: string[] | string;
  requirements: CollegeRequirements | string;
  research_data: ResearchData | string;
}

/* =========================
   Component
========================= */

const CollegeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [college, setCollege] = useState<College | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [adding, setAdding] = useState<boolean>(false);
  const [selectedProgram, setSelectedProgram] = useState<string>('');

  useEffect(() => {
    if (id) loadCollegeDetails(id);
  }, [id]);

  useEffect(() => {
    if (college) checkEligibility();
  }, [college, selectedProgram]);

  const loadCollegeDetails = async (collegeId: string): Promise<void> => {
    try {
      setLoading(true);
      const response = await api.colleges.getById<{ data: College }>(Number(collegeId));
      setCollege(response.data);
    } catch (error) {
      console.error('Failed to load college:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkEligibility = async (): Promise<void> => {
    try {
      if (!id) return;
      const response = await api.colleges.checkEligibility<{ data: EligibilityResult }>(Number(id), selectedProgram);
      setEligibility(response.data);
    } catch (error) {
      console.error('Failed to check eligibility:', error);
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
      alert('College added successfully! Deadlines generated automatically.');
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

  /* =========================
     Safe JSON Parsing
  ========================= */

  const programs: string[] = Array.isArray(college.programs)
    ? college.programs
    : JSON.parse(college.programs || '[]');

  const requirements: CollegeRequirements =
    typeof college.requirements === 'object'
      ? college.requirements
      : JSON.parse(college.requirements || '{}');

  const researchData: ResearchData =
    typeof college.research_data === 'object'
      ? college.research_data
      : JSON.parse(college.research_data || '{}');

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold">{college.name}</h1>
              <div className="flex items-center text-gray-600 mt-2">
                <MapPin className="w-4 h-4 mr-2" />
                {college.location}, {college.country}
              </div>
              {college.website_url && (
                <a
                  href={college.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 flex items-center mt-2"
                >
                  Visit Website <ExternalLink className="w-4 h-4 ml-1" />
                </a>
              )}
            </div>

            <button
              onClick={handleAddCollege}
              disabled={adding}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add to My List'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <StatBox
              icon={<TrendingUp />}
              label="Acceptance Rate"
              value={
                college.acceptance_rate
                  ? `${(college.acceptance_rate * 100).toFixed(1)}%`
                  : 'N/A'
              }
            />
            <StatBox icon={<BookOpen />} label="Type" value={college.type} />
            <StatBox icon={<Globe />} label="Application" value={college.application_portal} />
            <StatBox
              icon={<DollarSign />}
              label="Avg Cost"
              value={
                researchData.avg_cost
                  ? `$${researchData.avg_cost.toLocaleString()}`
                  : 'N/A'
              }
            />
          </div>
        </div>

        {/* Eligibility */}
        <div className="bg-white rounded-lg shadow-sm p-6 max-w-md ml-auto">
          <h2 className="text-xl font-semibold mb-4">Eligibility Check</h2>
          {eligibility ? <EligibilityBadge status={eligibility.status} /> : null}
        </div>
      </div>
    </div>
  );
};

/* =========================
   Helper Components
========================= */

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <div className="bg-white rounded-lg shadow-sm p-6">
    <h2 className="text-xl font-semibold mb-4">{title}</h2>
    {children}
  </div>
);

interface StatBoxProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const StatBox: React.FC<StatBoxProps> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
    <div className="text-blue-600">{icon}</div>
    <div>
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  </div>
);

interface EligibilityBadgeProps {
  status: EligibilityStatus;
}

const EligibilityBadge: React.FC<EligibilityBadgeProps> = ({ status }) => {
  const config = {
    eligible: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      icon: <CheckCircle />,
      label: 'Eligible'
    },
    conditional: {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      icon: <AlertCircle />,
      label: 'Conditionally Eligible'
    },
    not_eligible: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      icon: <XCircle />,
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
