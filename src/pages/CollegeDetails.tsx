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
  BarChart2,
  Search,
  Target,
  Loader2
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';
import { DataFreshnessIndicator } from '@/components/DataFreshnessIndicator';
import { getCollegeById, isSupabaseConfigured, normalizeToDetail } from '../lib/collegeService';
import { useAuth } from '../contexts/AuthContext';
const COLLEGE_SYNC_DEBUG = import.meta.env.DEV;

/* =========================
   Country-based Gradient Mapping
========================= */
const getCountryGradient = (country: string): string => {
  const countryLower = country?.toLowerCase() || '';
  
  // US colleges - Blue gradient
  if (countryLower.includes('united states') || countryLower === 'usa' || countryLower === 'us') {
    return 'from-blue-600 to-blue-900';
  }
  
  // UK colleges - Red gradient
  if (countryLower.includes('united kingdom') || countryLower === 'uk' || countryLower.includes('england') || 
      countryLower.includes('scotland') || countryLower.includes('wales')) {
    return 'from-red-600 to-red-900';
  }
  
  // EU colleges - Green gradient
  if (countryLower.includes('germany') || countryLower.includes('france') || countryLower.includes('netherlands') ||
      countryLower.includes('spain') || countryLower.includes('italy') || countryLower.includes('sweden') ||
      countryLower.includes('denmark') || countryLower.includes('belgium') || countryLower.includes('austria') ||
      countryLower.includes('switzerland') || countryLower.includes('ireland') || countryLower.includes('finland') ||
      countryLower.includes('norway') || countryLower.includes('portugal') || countryLower.includes('poland')) {
    return 'from-emerald-600 to-emerald-900';
  }
  
  // India colleges - Orange gradient
  if (countryLower.includes('india')) {
    return 'from-orange-500 to-orange-800';
  }
  
  // China/Asia colleges - Purple gradient
  if (countryLower.includes('china') || countryLower.includes('japan') || countryLower.includes('korea') ||
      countryLower.includes('singapore') || countryLower.includes('hong kong') || countryLower.includes('taiwan') ||
      countryLower.includes('malaysia') || countryLower.includes('thailand') || countryLower.includes('vietnam') ||
      countryLower.includes('indonesia') || countryLower.includes('philippines')) {
    return 'from-purple-600 to-purple-900';
  }
  
  // Canada - Red and white inspired gradient
  if (countryLower.includes('canada')) {
    return 'from-red-500 to-rose-800';
  }
  
  // Australia/NZ - Teal gradient
  if (countryLower.includes('australia') || countryLower.includes('new zealand')) {
    return 'from-teal-600 to-teal-900';
  }
  
  // Default - Blue gradient
  return 'from-blue-600 to-blue-800';
};

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
  official_website?: string;
  admissions_url?: string;
  programs_url?: string;
  application_portal_url?: string;
  academic_strengths?: string[] | string;
  major_categories?: string[] | string;
  programs?: Array<{
    programName: string;
    degreeType: string;
    enrollment?: number | null;
    acceptanceRate?: number | null;
    source?: string;
  }> | string[] | string;
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
  // Comprehensive data from new schema
  comprehensiveData?: {
    stateRegion?: string | null;
    city?: string | null;
    urbanClassification?: string | null;
    institutionType?: string | null;
    classification?: string | null;
    religiousAffiliation?: string | null;
    foundingYear?: number | null;
    campusSizeAcres?: number | null;
    undergraduateEnrollment?: number | null;
    graduateEnrollment?: number | null;
    totalEnrollment?: number | null;
    studentFacultyRatio?: string | null;
    websiteUrl?: string | null;
  };
  admissionsData?: {
    year?: number;
    acceptanceRate?: number | null;
    earlyDecisionRate?: number | null;
    earlyActionRate?: number | null;
    testOptionalFlag?: number;
    source?: string;
    confidenceScore?: number;
  };
  studentStats?: {
    year?: number;
    gpa25?: number | null;
    gpa50?: number | null;
    gpa75?: number | null;
    sat25?: number | null;
    sat50?: number | null;
    sat75?: number | null;
    sat_range?: string | null;
    act25?: number | null;
    act50?: number | null;
    act75?: number | null;
    act_range?: string | null;
    source?: string;
  };
  // Allow accessing hypothetical nested shapes from alternate API responses
  student_stats?: {
    sat_range?: string | null;
    act_range?: string | null;
  };
  financial?: {
    avg_net_price?: number | null;
  };
  outcomes?: {
    median_debt?: number | null;
    median_salary_6yr?: number | null;
    median_salary_10yr?: number | null;
    retention_rate?: number | null;
    graduation_rate_4yr?: number | null;
  };
  financialData?: {
    year?: number;
    tuitionInState?: number | null;
    tuitionOutState?: number | null;
    tuitionInternational?: number | null;
    costOfAttendance?: number | null;
    avgFinancialAid?: number | null;
    avgNetPrice?: number | null;
    percentReceivingAid?: number | null;
    avgDebt?: number | null;
    medianDebt?: number | null;
    netPriceLowIncome?: number | null;
    netPriceMidIncome?: number | null;
    netPriceHighIncome?: number | null;
    source?: string;
  };
  data_source?: string | null;
  data_source_url?: string | null;
  last_updated_at?: string | null;
  updated_at?: string | null;
  last_scraped?: string | null;
  data_quality_score?: number | null;
  needs_enrichment?: boolean | null;
  academicOutcomes?: {
    year?: number;
    graduationRate4yr?: number | null;
    graduationRate6yr?: number | null;
    retentionRate?: number | null;
    employmentRate?: number | null;
    medianStartSalary?: number | null;
    medianSalary6yr?: number | null;
    medianMidCareerSalary?: number | null;
    medianSalary10yr?: number | null;
    salaryGrowthRate?: number | null;
    employedAt6MonthsRate?: number | null;
    employedInFieldRate?: number | null;
    source?: string;
  };
  demographics?: {
    year?: number;
    percentInternational?: number | null;
    genderRatio?: string | null;
    ethnicDistribution?: Record<string, number>;
    percentFirstGen?: number | null;
    // Flat demographic percentage fields (0-1 decimal)
    percentMale?: number | null;
    percentFemale?: number | null;
    percentNonbinary?: number | null;
    percentWhite?: number | null;
    percentBlack?: number | null;
    percentHispanic?: number | null;
    percentAsian?: number | null;
    percentNativeAmerican?: number | null;
    percentPacificIslander?: number | null;
    percentMultiracial?: number | null;
    // Alternate snake_case paths from possible API variations
    percent_male?: number | null;
    percent_female?: number | null;
    percent_white?: number | null;
    percent_black?: number | null;
    percent_hispanic?: number | null;
    percent_asian?: number | null;
    percent_international?: number | null;
    source?: string;
  };
  // Top-level fields for alternate API shapes / direct fallback paths
  alternate_names?: string | null;
  religious_affiliation?: string | null;
  avg_net_price?: number | null;
  median_debt?: number | null;
  median_salary_6yr?: number | null;
  median_salary_10yr?: number | null;
  percent_male?: number | null;
  percent_female?: number | null;
  percent_white?: number | null;
  percent_black?: number | null;
  percent_hispanic?: number | null;
  percent_asian?: number | null;
  percent_international?: number | null;
  campusLife?: {
    housingGuarantee?: string | null;
    campusSafetyScore?: number | null;
    athleticsDivision?: string | null;
    clubCount?: number | null;
    source?: string;
  };
  rankings?: Array<{
    year: number;
    rankingBody: string;
    nationalRank?: number | null;
    globalRank?: number | null;
  }>;
}

type TabName = 'overview' | 'admissions' | 'academics' | 'cost' | 'studentLife' | 'outcomes';

/* =========================
   Component
========================= */

const CollegeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [college, setCollege] = useState<College | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [adding, setAdding] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabName>('overview');
  const [chancingResult, setChancingResult] = useState<{
    tier: string;
    category: string;
    confidence: string;
    explanation: string | {
      summary?: string;
      factors?: Record<string, unknown>;
      probabilityRange?: { low: number; high: number };
      missingDataFields?: string[];
      recommendedActions?: string[];
    };
    probabilityRange?: { low: number; high: number };
    missingDataFields?: string[];
    recommendedActions?: string[];
  } | null>(null);
  const [chancingLoading, setChancingLoading] = useState(false);

  useEffect(() => {
    if (id) {
      loadCollegeDetails(Number(id));
    }
  }, [id, user]);

  const loadCollegeDetails = async (collegeId: number): Promise<void> => {
    try {
      setLoading(true);
      let collegeData: College | null = null;

      if (isSupabaseConfigured) {
        // ── Supabase path: fetch from canonical colleges table (+ allowed child tables) ──
        const raw = await getCollegeById(collegeId);
        if (raw) {
          if (COLLEGE_SYNC_DEBUG) {
            console.debug('[CollegeSync] detail.raw-supabase', {
              id: raw.id,
              name: raw.name,
              financialRows: raw.college_financial_data?.length ?? 0,
              rankingRows: raw.college_rankings?.length ?? 0,
              deadlineRows: raw.college_deadlines?.length ?? 0,
              data_source: (raw as any).data_source ?? null,
            });
          }
          collegeData = normalizeToDetail(raw) as College;
          if (COLLEGE_SYNC_DEBUG) {
            console.debug('[CollegeSync] detail.normalized', {
              id: collegeData.id,
              name: collegeData.name,
              acceptanceRate: collegeData.acceptanceRate ?? collegeData.acceptance_rate ?? null,
              tuition_cost: collegeData.tuition_cost ?? null,
              ranking: collegeData.ranking ?? null,
              deadlines: collegeData.deadlineTemplates ?? null,
              data_source: collegeData.data_source ?? null,
            });
          }
        }
      } else {
        // ── Legacy backend path ────────────────────────────────────────────────
        const response = await api.colleges.getById(collegeId);
        collegeData = response.data;
      }

      setCollege(collegeData);

      // ── Fire 'viewed' signal for online-learning vector adjustment ──────────
      if (user) {
        api.signals.fire(collegeId, 'viewed').catch(() => {/* non-critical */});
      }

      if (user) {
        try {
          setChancingLoading(true);
          const chancingResponse = await api.chancing.calculate({ collegeId });
          setChancingResult(chancingResponse.data?.chancing ?? chancingResponse.data);
        } catch (chancingError) {
          console.warn('Chancing calculation failed (non-critical):', chancingError);
        } finally { setChancingLoading(false); }
      } else {
        setChancingResult(null);
        setChancingLoading(false);
      }
    } catch (error) {
      console.error('Failed to load college:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!COLLEGE_SYNC_DEBUG || !college) return;
    console.debug('[CollegeSync] detail.state', {
      id: college.id,
      name: college.name,
      acceptanceRate: college.acceptanceRate ?? college.acceptance_rate ?? null,
      tuition_cost: college.tuition_cost ?? null,
      ranking: college.ranking ?? null,
      deadlines: college.deadlineTemplates ?? null,
      data_source: college.data_source ?? null,
    });
  }, [college]);

  const handleAddCollege = async (): Promise<void> => {
    if (!college) return;
    if (!user) {
      toast.error('Sign in to add colleges to your list.');
      navigate('/auth');
      return;
    }

    try {
      setAdding(true);
      const payload = {
        college_id: college.id,
        canonical_institution_id: college.id,
        application_type: 'regular',
      };
      try {
        await api.applications.create(payload);
      } catch (firstErr: any) {
        if (String(firstErr?.message ?? '').toLowerCase().includes('network')) {
          await api.applications.create(payload);
        } else {
          throw firstErr;
        }
      }
      toast.success('College added to your list!');
      navigate('/applications');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to add college';
      if (msg.toLowerCase().includes('already')) {
        toast.info('College is already in your list.');
      } else {
        toast.error(msg);
      }
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6 animate-pulse">
        {/* Hero skeleton */}
        <div className="rounded-2xl overflow-hidden bg-muted">
          <div className="h-64 bg-muted-foreground/10" />
          <div className="p-6 space-y-3">
            <div className="h-8 w-1/2 bg-muted-foreground/10 rounded-lg" />
            <div className="h-4 w-1/3 bg-muted-foreground/10 rounded" />
            <div className="flex gap-3 mt-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-10 w-24 bg-muted-foreground/10 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
        {/* Stats bar skeleton */}
        <div className="flex gap-4 flex-wrap">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-12 w-36 bg-muted-foreground/10 rounded-xl" />
          ))}
        </div>
        {/* Tabs skeleton */}
        <div className="flex gap-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-10 w-24 bg-muted-foreground/10 rounded-lg" />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-40 bg-muted-foreground/10 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!college) {
    return (
      <div className="p-6 text-center">
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
  // Handle programs - can be array of strings or array of objects
  const programs = Array.isArray(college.programs) && college.programs.length > 0
    ? (typeof college.programs[0] === 'string' ? college.programs as string[] : (college.programs as Array<{ programName: string }>).map(p => p.programName))
    : parseArray(college.programs as string | string[]);

  // Format helpers - return null for missing data instead of "N/A"
  const formatAcceptanceRate = (rate: number | null | undefined): string | null => {
    if (rate === null || rate === undefined) return null;
    const percentage = rate <= 1 ? rate * 100 : rate;
    return `${percentage.toFixed(1)}%`;
  };

  const formatCurrency = (amount: number | null | undefined, country: string): string | null => {
    if (amount === null || amount === undefined) return null;
    if (country === 'India') {
      return `₹${amount.toLocaleString('en-IN')}`;
    } else if (country === 'United Kingdom') {
      return `£${amount.toLocaleString('en-GB')}`;
    } else if (country === 'Germany') {
      return amount === 0 ? 'Free (Public)' : `€${amount.toLocaleString('de-DE')}`;
    }
    return `$${amount.toLocaleString('en-US')}`;
  };

  const formatEnrollment = (num: number | null | undefined): string | null => {
    if (!num) return null;
    return num?.toLocaleString() ?? '';
  };

  const acceptanceRate = college.acceptanceRate ?? college.acceptance_rate;
  const testScores = college.testScores || {};

  /* =========================
     Robust Field Resolvers
     Each resolver checks multiple possible paths before returning null.
  ========================= */

  // Parse a "low-high" range string like "1510-1570" into { low, high }
  const parseRangeString = (s: string | null | undefined): { low: number; high: number } | null => {
    if (!s) return null;
    const parts = s.split('-');
    if (parts.length !== 2) return null;
    const low = parseInt(parts[0].trim(), 10);
    const high = parseInt(parts[1].trim(), 10);
    if (!isNaN(low) && !isNaN(high)) return { low, high };
    return null;
  };

  // Average Net Price
  const resolvedAvgNetPrice: number | null =
    college.financialData?.avgNetPrice ??
    college.financialData?.avgFinancialAid ??
    (college as any).financial?.avg_net_price ??
    college.avg_net_price ??
    null;

  // Median Student Debt
  const resolvedMedianDebt: number | null =
    college.financialData?.medianDebt ??
    college.financialData?.avgDebt ??
    (college as any).outcomes?.median_debt ??
    college.median_debt ??
    null;

  // SAT range: prefer separate percentile fields, fall back to range string
  const resolvedSATRange: { low: number; high: number } | null = (() => {
    if (college.studentStats?.sat25 && college.studentStats?.sat75) {
      return { low: college.studentStats.sat25, high: college.studentStats.sat75 };
    }
    if (testScores.satRange) {
      return { low: testScores.satRange.percentile25, high: testScores.satRange.percentile75 };
    }
    return (
      parseRangeString(college.studentStats?.sat_range) ??
      parseRangeString(college.student_stats?.sat_range) ??
      null
    );
  })();

  // ACT range: prefer separate percentile fields, fall back to range string
  const resolvedACTRange: { low: number; high: number } | null = (() => {
    if (college.studentStats?.act25 && college.studentStats?.act75) {
      return { low: college.studentStats.act25, high: college.studentStats.act75 };
    }
    if (testScores.actRange) {
      return { low: testScores.actRange.percentile25, high: testScores.actRange.percentile75 };
    }
    return (
      parseRangeString(college.studentStats?.act_range) ??
      parseRangeString(college.student_stats?.act_range) ??
      null
    );
  })();

  // Median Salary 6yr (start salary)
  const resolvedSalary6yr: number | null =
    college.academicOutcomes?.medianSalary6yr ??
    college.academicOutcomes?.medianStartSalary ??
    (college as any).outcomes?.median_salary_6yr ??
    college.median_salary_6yr ??
    null;

  // Median Salary 10yr (mid-career)
  const resolvedSalary10yr: number | null =
    college.academicOutcomes?.medianSalary10yr ??
    college.academicOutcomes?.medianMidCareerSalary ??
    (college as any).outcomes?.median_salary_10yr ??
    college.median_salary_10yr ??
    null;

  // Retention Rate
  const resolvedRetentionRate: number | null =
    college.academicOutcomes?.retentionRate ??
    (college as any).outcomes?.retention_rate ??
    null;

  // 4yr Graduation Rate
  const resolvedGradRate4yr: number | null =
    college.academicOutcomes?.graduationRate4yr ??
    (college as any).outcomes?.graduation_rate_4yr ??
    null;

  // Religious Affiliation
  const resolvedReligiousAffiliation: string | null =
    college.comprehensiveData?.religiousAffiliation ??
    college.religious_affiliation ??
    null;

  // Alternate Names
  const resolvedAlternateNames: string | null =
    college.comprehensiveData?.alternateName ??
    college.alternate_names ??
    null;

  // Demographics: flat percent fields (prefer camelCase from model, fall back to snake_case)
  const resolvedPercentMale: number | null =
    college.demographics?.percentMale ??
    college.demographics?.percent_male ??
    college.percent_male ??
    null;
  const resolvedPercentFemale: number | null =
    college.demographics?.percentFemale ??
    college.demographics?.percent_female ??
    college.percent_female ??
    null;
  const resolvedPercentWhite: number | null =
    college.demographics?.percentWhite ??
    college.demographics?.percent_white ??
    college.percent_white ??
    null;
  const resolvedPercentBlack: number | null =
    college.demographics?.percentBlack ??
    college.demographics?.percent_black ??
    college.percent_black ??
    null;
  const resolvedPercentHispanic: number | null =
    college.demographics?.percentHispanic ??
    college.demographics?.percent_hispanic ??
    college.percent_hispanic ??
    null;
  const resolvedPercentAsian: number | null =
    college.demographics?.percentAsian ??
    college.demographics?.percent_asian ??
    college.percent_asian ??
    null;
  const resolvedPercentNativeAmerican: number | null =
    college.demographics?.percentNativeAmerican ?? null;
  const resolvedPercentMultiracial: number | null =
    college.demographics?.percentMultiracial ?? null;
  const resolvedPercentInternational: number | null =
    college.demographics?.percentInternational ??
    college.demographics?.percent_international ??
    college.percent_international ??
    null;

  // Build flat ethnicity map from flat fields (used when ethnicDistribution is empty/missing)
  const flatEthnicityMap: Record<string, number> = {};
  if (resolvedPercentWhite != null) flatEthnicityMap['White'] = resolvedPercentWhite;
  if (resolvedPercentBlack != null) flatEthnicityMap['Black'] = resolvedPercentBlack;
  if (resolvedPercentHispanic != null) flatEthnicityMap['Hispanic'] = resolvedPercentHispanic;
  if (resolvedPercentAsian != null) flatEthnicityMap['Asian'] = resolvedPercentAsian;
  if (resolvedPercentNativeAmerican != null) flatEthnicityMap['Native American'] = resolvedPercentNativeAmerican;
  if (resolvedPercentMultiracial != null) flatEthnicityMap['Multiracial'] = resolvedPercentMultiracial;

  // Resolved ethnicity distribution: prefer existing ethnicDistribution, fall back to flat fields
  const resolvedEthnicDistribution: Record<string, number> =
    (college.demographics?.ethnicDistribution && Object.keys(college.demographics.ethnicDistribution).length > 0)
      ? college.demographics.ethnicDistribution
      : flatEthnicityMap;

  // Determine if we have gender data
  const hasGenderData = resolvedPercentMale != null || resolvedPercentFemale != null || !!college.demographics?.genderRatio;
  // Determine if we have ethnicity data
  const hasEthnicityData = Object.keys(resolvedEthnicDistribution).length > 0;

  // Get dynamic gradient based on country
  const heroGradient = getCountryGradient(college.country);

  const formatProvenanceDate = (dateLike: string | null | undefined): string | null => {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  };

  const tabs: { id: TabName; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Building className="w-4 h-4" /> },
    { id: 'admissions', label: 'Admissions', icon: <FileText className="w-4 h-4" /> },
    { id: 'academics', label: 'Academics', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'cost', label: 'Cost & Aid', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'studentLife', label: 'Student Life', icon: <Users className="w-4 h-4" /> },
    { id: 'outcomes', label: 'Outcomes', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <div>
      {/* Hero Section - Dynamic gradient based on country */}
      <div className={`bg-gradient-to-r ${heroGradient} text-white`}>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <button
            onClick={() => navigate('/colleges')}
            className="text-white/70 hover:text-white mb-4 text-sm flex items-center gap-1"
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
                  {[college.city, college.state, college.country].filter(Boolean).join(', ') || 'Location not specified'}
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

            <div className="flex flex-col items-end gap-3">
              <button
                onClick={handleAddCollege}
                disabled={adding}
                className="px-6 py-3 bg-white/90 text-primary/80 rounded-lg font-semibold disabled:opacity-50 hover:bg-white transition-colors"
              >
                {adding ? 'Adding…' : '+ Add to My List'}
              </button>
              
              {/* Chancing Card */}
              {user ? (
                <>
                  {chancingLoading && <Loader2 className="animate-spin" size={16} />}
                  {chancingResult && (
                    <div className={`px-4 py-2 rounded-lg font-medium ${
                      chancingResult.tier === 'Safety' ? 'bg-green-400 text-green-900' :
                      chancingResult.tier === 'Match' ? 'bg-yellow-400 text-yellow-900' :
                      'bg-red-400 text-red-900'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        <span>{chancingResult.tier}</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="px-4 py-2 rounded-lg font-medium bg-white/10 text-white/80 border border-white/20">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    <span>Sign in to see your chances</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats Bar - Enhanced with comprehensive data */}
          <div className="flex flex-wrap gap-4 mt-8 bg-white/10 rounded-xl p-4">
            {(() => {
              const acceptanceRateStr = formatAcceptanceRate(acceptanceRate);
              return acceptanceRateStr && <QuickStat label="Acceptance Rate" value={acceptanceRateStr} />;
            })()}
            
            {/* Show comprehensive enrollment if available, otherwise fallback */}
            {(() => {
              if (college.comprehensiveData?.totalEnrollment) {
                return <QuickStat label="Total Enrollment" value={college.comprehensiveData.totalEnrollment?.toLocaleString() ?? ''} />;
              }
              const enrollmentStr = formatEnrollment(college.enrollment);
              return enrollmentStr && <QuickStat label="Enrollment" value={enrollmentStr} />;
            })()}
            
            {/* Show undergrad enrollment if available */}
            {college.comprehensiveData?.undergraduateEnrollment && (
              <QuickStat label="Undergrad" value={college.comprehensiveData.undergraduateEnrollment?.toLocaleString() ?? ''} />
            )}
            
            {/* Show net price prominently if available */}
            {(() => {
              if (resolvedAvgNetPrice) {
                return <QuickStat label="Avg Net Price" value={`$${resolvedAvgNetPrice?.toLocaleString() ?? ''}`} />;
              }
              // Fallback to tuition
              const tuitionStr = formatCurrency(college.tuition_cost, college.country);
              return tuitionStr && <QuickStat label="Tuition" value={tuitionStr} />;
            })()}
            
            {/* Show retention rate if available */}
            {resolvedRetentionRate != null && (
              <QuickStat label="Retention Rate" value={`${(resolvedRetentionRate * 100).toFixed(1)}%`} />
            )}
            
            {/* Show average GPA/SAT if available */}
            {(testScores.averageGPA || college.studentStats?.gpa50) && (
              <QuickStat label="Avg GPA" value={(college.studentStats?.gpa50 || testScores.averageGPA)?.toFixed(2) || ''} />
            )}
            
            {/* Show student-faculty ratio */}
            {(college.comprehensiveData?.studentFacultyRatio || college.studentFacultyRatio) && (
              <QuickStat label="Student:Faculty" value={college.comprehensiveData?.studentFacultyRatio || college.studentFacultyRatio || ''} />
            )}
          </div>
        </div>
      </div>

      {/* Data Freshness Indicator */}
      <div className="max-w-6xl mx-auto px-6 py-4">
        <DataFreshnessIndicator
          lastUpdated={college.updated_at || college.last_scraped || new Date().toISOString()}
          sourceUrl={college.official_website}
          collegeName={college.name}
        />
        <div className="mt-3 text-xs text-muted-foreground">
          {college.data_source ? (
            <>
              Data from{' '}
              {college.data_source_url ? (
                <a
                  href={college.data_source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-primary"
                >
                  {college.data_source}
                </a>
              ) : (
                <span>{college.data_source}</span>
              )}
              {' · '}
              {formatProvenanceDate(college.last_updated_at)
                ? `Last updated ${formatProvenanceDate(college.last_updated_at)}`
                : 'Data not yet verified'}
            </>
          ) : (
            <span>Data not yet verified</span>
          )}
          {(college.data_quality_score ?? 0) < 50 && (
            <span className="ml-2 text-amber-600">⚠ Incomplete data — some fields may be missing.</span>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-background border-b border-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
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
        {/* Chancing Section - Show prominently if available */}
        {user ? (
          chancingResult && (
            <div className={`mb-6 p-4 rounded-xl border-2 ${
              chancingResult.tier === 'Safety' ? 'bg-emerald-500/10 border-green-200' :
              chancingResult.tier === 'Match' ? 'bg-yellow-50 border-yellow-200' :
              'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className={`text-3xl font-bold ${
                    chancingResult.tier === 'Safety' ? 'text-emerald-500' :
                    chancingResult.tier === 'Match' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {chancingResult.tier}
                  </div>
                  <div>
                  <div className="text-lg font-semibold text-foreground">
                    {chancingResult.confidence} confidence
                  </div>
                  {chancingResult.tier === 'Unknown' ? (
                    <p className="text-sm text-muted-foreground">Chancing unavailable right now — check back in a moment.</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {typeof chancingResult.explanation === 'string'
                        ? chancingResult.explanation
                        : chancingResult.explanation?.summary ?? ''}
                    </p>
                  )}
                  {/* Probability range */}
                  {(() => {
                    const pr = (typeof chancingResult.explanation === 'object' && chancingResult.explanation?.probabilityRange)
                      || chancingResult.probabilityRange;
                    if (!pr) return null;
                    return (
                      <p className="text-xs text-muted-foreground mt-1">
                        Estimated range: {Math.round(pr.low * 100)}%–{Math.round(pr.high * 100)}%
                      </p>
                    );
                  })()}
                  {/* Recommended actions */}
                  {(() => {
                    const actions = (typeof chancingResult.explanation === 'object' && chancingResult.explanation?.recommendedActions)
                      || chancingResult.recommendedActions;
                    if (!actions?.length) return null;
                    return (
                      <ul className="mt-2 space-y-1">
                        {actions.map((action, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                            <span className="mt-0.5 shrink-0">•</span>
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
                </div>
                <div className="text-xs text-muted-foreground max-w-xs">
                  ⚠️ This is an estimate based on reported median stats for all applicants. International applicant pools are typically more selective.
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="mb-6 p-4 rounded-xl border-2 border-dashed border-border bg-muted/40 text-muted-foreground">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-lg font-semibold text-foreground/80">
                  Sign in to see your admission chances for {college?.name || 'this college'}
                </div>
                <p className="text-sm">Create a free account to unlock chancing for this college.</p>
              </div>
              <button
                onClick={() => navigate('/auth')}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
              >
                Create Free Account
              </button>
            </div>
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Description */}
              {college.description && (
                <Card title="About">
                  <p className="text-foreground/80 leading-relaxed">{college.description}</p>
                </Card>
              )}

              {/* Key Statistics - Enhanced with comprehensive data */}
              <Card title="Key Statistics">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Acceptance Rate */}
                  {(() => {
                    const acceptanceRateStr = formatAcceptanceRate(acceptanceRate);
                    return acceptanceRateStr && <StatItem label="Acceptance Rate" value={acceptanceRateStr} icon={<TrendingUp />} />;
                  })()}
                  
                  {/* Total Enrollment */}
                  {(() => {
                    if (college.comprehensiveData?.totalEnrollment) {
                      return <StatItem label="Total Enrollment" value={college.comprehensiveData.totalEnrollment?.toLocaleString() ?? ''} icon={<Users />} />;
                    }
                    const enrollmentStr = formatEnrollment(college.enrollment);
                    return enrollmentStr && <StatItem label="Total Enrollment" value={enrollmentStr} icon={<Users />} />;
                  })()}
                  
                  {/* Undergraduate Enrollment */}
                  {college.comprehensiveData?.undergraduateEnrollment && (
                    <StatItem label="Undergraduate" value={college.comprehensiveData.undergraduateEnrollment?.toLocaleString() ?? ''} icon={<Users />} />
                  )}
                  
                  {/* Graduate Enrollment */}
                  {college.comprehensiveData?.graduateEnrollment && (
                    <StatItem label="Graduate" value={college.comprehensiveData.graduateEnrollment?.toLocaleString() ?? ''} icon={<GraduationCap />} />
                  )}
                  
                  {/* Student-Faculty Ratio */}
                  {(college.comprehensiveData?.studentFacultyRatio || college.studentFacultyRatio) && (
                    <StatItem 
                      label="Student:Faculty Ratio" 
                      value={college.comprehensiveData?.studentFacultyRatio || college.studentFacultyRatio || ''} 
                      icon={<GraduationCap />} 
                    />
                  )}
                  
                  {/* 4-Year Graduation Rate */}
                  {(resolvedGradRate4yr != null || college.graduationRates?.fourYear) && (
                    <StatItem 
                      label="4-Year Grad Rate" 
                      value={resolvedGradRate4yr != null
                        ? `${(resolvedGradRate4yr * 100).toFixed(1)}%`
                        : `${college.graduationRates?.fourYear}%`
                      } 
                      icon={<Award />} 
                    />
                  )}
                  
                  {/* Retention Rate */}
                  {resolvedRetentionRate != null && (
                    <StatItem 
                      label="Retention Rate" 
                      value={`${(resolvedRetentionRate * 100).toFixed(1)}%`} 
                      icon={<Award />} 
                    />
                  )}
                  
                  {/* Average SAT */}
                  {college.studentStats?.sat50 && (
                    <StatItem label="Average SAT" value={college.studentStats.sat50?.toString() ?? ''} icon={<FileText />} />
                  )}
                  
                  {/* Average ACT */}
                  {college.studentStats?.act50 && (
                    <StatItem label="Average ACT" value={college.studentStats.act50?.toString() ?? ''} icon={<FileText />} />
                  )}
                  
                  {/* Average GPA */}
                  {(college.studentStats?.gpa50 || testScores.averageGPA) && (
                    <StatItem 
                      label="Average GPA" 
                      value={(college.studentStats?.gpa50 || testScores.averageGPA)?.toFixed(2) || ''} 
                      icon={<FileText />} 
                    />
                  )}
                  
                  {/* Average Net Price */}
                  {resolvedAvgNetPrice != null && (
                    <StatItem label="Avg Net Price" value={`$${resolvedAvgNetPrice?.toLocaleString() ?? ''}`} icon={<DollarSign />} />
                  )}
                  
                  {/* Median Starting Salary */}
                  {resolvedSalary6yr != null && (
                    <StatItem 
                      label="Median Salary (6 yrs)" 
                      value={`$${resolvedSalary6yr?.toLocaleString() ?? ''}`} 
                      icon={<Briefcase />} 
                    />
                  )}
                  
                  {/* Institution Type */}
                  {(college.comprehensiveData?.institutionType || college.type) && (
                    <StatItem 
                      label="Institution Type" 
                      value={college.comprehensiveData?.institutionType || college.type || ''} 
                      icon={<Building />} 
                    />
                  )}
                </div>
              </Card>

              {/* Academic Strengths */}
              {academicStrengths.length > 0 && (
                <Card title="Academic Strengths">
                  <div className="flex flex-wrap gap-2">
                    {academicStrengths.map((strength, i) => (
                      <span key={i} className="px-3 py-1.5 bg-emerald-500/10 text-green-700 rounded-full text-sm font-medium">
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
                  <MapPin className="w-5 h-5 text-muted-foreground/50 mt-0.5" />
                  <div>
                    <p className="font-medium">{[college.city, college.state, college.country].filter(Boolean).join(', ') || college.country}</p>
                    <p className="text-sm text-muted-foreground">{college.country}</p>
                  </div>
                </div>
              </Card>

              {/* Institution Details - religious affiliation, alternate names */}
              {(resolvedReligiousAffiliation || resolvedAlternateNames) && (
                <Card title="Institution Details">
                  <div className="space-y-3">
                    {resolvedAlternateNames && (
                      <div>
                        <p className="text-xs text-muted-foreground/70 mb-1">Also Known As</p>
                        <p className="text-sm font-medium text-gray-800">{resolvedAlternateNames}</p>
                      </div>
                    )}
                    {resolvedReligiousAffiliation && (
                      <div>
                        <p className="text-xs text-muted-foreground/70 mb-1">Religious Affiliation</p>
                        <p className="text-sm font-medium text-gray-800">{resolvedReligiousAffiliation}</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}
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
                    <div className="text-4xl font-bold text-primary">{formatAcceptanceRate(acceptanceRate)}</div>
                    <p className="text-muted-foreground text-sm mt-1">Overall Acceptance Rate</p>
                  </div>
                  <div className="flex-1">
                    <div className="w-full bg-muted rounded-full h-4">
                      <div 
                        className="bg-blue-600 h-4 rounded-full" 
                        style={{ width: `${Math.min(acceptanceRate != null ? (acceptanceRate <= 1 ? acceptanceRate * 100 : acceptanceRate) : 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Test Scores - Enhanced with studentStats data */}
              <Card title="Test Score Ranges">
                {/* Test Optional Badge */}
                {college.admissionsData?.testOptionalFlag === 1 && (
                  <div className="mb-4">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                      <CheckCircle className="w-4 h-4" />
                      Test Optional
                    </span>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* SAT Scores */}
                  {resolvedSATRange != null && (
                    <div>
                      <h4 className="font-medium text-foreground mb-3">SAT</h4>
                      <div className="space-y-3">
                        <ScoreBar label="Middle 50%" low={resolvedSATRange.low} high={resolvedSATRange.high} max={1600} />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">25th: {resolvedSATRange.low}</span>
                          {college.studentStats?.sat50 && (
                            <span className="font-semibold text-primary">Avg: {college.studentStats.sat50}</span>
                          )}
                          <span className="text-muted-foreground">75th: {resolvedSATRange.high}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* ACT Scores */}
                  {resolvedACTRange != null && (
                    <div>
                      <h4 className="font-medium text-foreground mb-3">ACT</h4>
                      <div className="space-y-3">
                        <ScoreBar label="Middle 50%" low={resolvedACTRange.low} high={resolvedACTRange.high} max={36} />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">25th: {resolvedACTRange.low}</span>
                          {college.studentStats?.act50 && (
                            <span className="font-semibold text-primary">Avg: {college.studentStats.act50}</span>
                          )}
                          <span className="text-muted-foreground">75th: {resolvedACTRange.high}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {resolvedSATRange == null && resolvedACTRange == null && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-center">Test score data not available</p>
                    </div>
                  )}
                </div>
                
                {/* GPA */}
                {(testScores.averageGPA || college.studentStats?.gpa50) && (
                  <div className="mt-6 pt-6 border-t">
                    <h4 className="font-medium text-foreground mb-3">GPA</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {college.studentStats?.gpa25 && (
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className="text-xl font-bold text-foreground/80">{college.studentStats.gpa25?.toFixed(2) ?? 'N/A'}</div>
                          <div className="text-xs text-muted-foreground/70">25th Percentile</div>
                        </div>
                      )}
                      {(testScores.averageGPA || college.studentStats?.gpa50) && (
                        <div className="text-center p-3 bg-primary/5 rounded-lg">
                          <div className="text-2xl font-bold text-primary">
                            {(college.studentStats?.gpa50 || testScores.averageGPA)?.toFixed(2)}
                          </div>
                          <div className="text-xs text-primary">Average GPA</div>
                        </div>
                      )}
                      {college.studentStats?.gpa75 && (
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className="text-xl font-bold text-foreground/80">{college.studentStats.gpa75?.toFixed(2) ?? 'N/A'}</div>
                          <div className="text-xs text-muted-foreground/70">75th Percentile</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>

              {/* Application Deadlines */}
              {college.deadlineTemplates && Object.keys(college.deadlineTemplates).length > 0 && (
                <Card title="Application Deadlines">
                  <div className="space-y-3">
                    {Object.entries(college.deadlineTemplates)
                      .filter(([, deadline]) => deadline !== null)
                      .map(([key, deadline]) => (
                      <div key={key} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <Calendar className="w-5 h-5 text-primary" />
                          <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        </div>
                        <span className="text-foreground/80">
                          {typeof deadline === 'string' ? deadline : (deadline as { date: string })?.date || 'N/A'}
                        </span>
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
                            <p className="text-sm text-muted-foreground">Cutoff data available</p>
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
                      <div className="p-4 bg-primary/5 rounded-lg">
                        <p className="text-sm text-primary font-medium">IB Points</p>
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
                      <div className="p-4 bg-primary/5 rounded-lg">
                        <p className="text-sm text-primary font-medium">English Level</p>
                        <p className="text-lg font-semibold">{college.englishLevel}</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Rankings - Display if available */}
              {college.rankings && college.rankings.length > 0 && (
                <Card title="University Rankings">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {college.rankings.map((ranking, index) => (
                      <div key={index} className="p-4 bg-muted rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-primary">{ranking.rankingBody}</p>
                          <Award className="w-4 h-4 text-primary" />
                        </div>
                        <div className="space-y-1">
                          {ranking.nationalRank && (
                            <p className="text-2xl font-bold text-foreground">#{ranking.nationalRank}</p>
                          )}
                          {ranking.globalRank && !ranking.nationalRank && (
                            <p className="text-2xl font-bold text-foreground">#{ranking.globalRank}</p>
                          )}
                          <p className="text-xs text-muted-foreground/70">
                            {ranking.nationalRank ? 'National Rank' : 'Global Rank'} ({ranking.year})
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Comprehensive Institution Info */}
              {college.comprehensiveData && (
                <Card title="Institution Details">
                  <div className="space-y-4">
                    {resolvedAlternateNames && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm text-muted-foreground">Also Known As</span>
                        <span className="font-semibold text-foreground">{resolvedAlternateNames}</span>
                      </div>
                    )}
                    {college.comprehensiveData.institutionType && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm text-muted-foreground">Type</span>
                        <span className="font-semibold text-foreground">{college.comprehensiveData.institutionType}</span>
                      </div>
                    )}
                    {college.comprehensiveData.classification && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm text-muted-foreground">Classification</span>
                        <span className="font-semibold text-foreground">{college.comprehensiveData.classification}</span>
                      </div>
                    )}
                    {college.comprehensiveData.urbanClassification && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm text-muted-foreground">Setting</span>
                        <span className="font-semibold text-foreground">{college.comprehensiveData.urbanClassification}</span>
                      </div>
                    )}
                    {college.comprehensiveData.foundingYear && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm text-muted-foreground">Founded</span>
                        <span className="font-semibold text-foreground">{college.comprehensiveData.foundingYear}</span>
                      </div>
                    )}
                    {college.comprehensiveData.campusSizeAcres && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm text-muted-foreground">Campus Size</span>
                        <span className="font-semibold text-foreground">{college.comprehensiveData.campusSizeAcres} acres</span>
                      </div>
                    )}
                    {resolvedReligiousAffiliation && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm text-muted-foreground">Religious Affiliation</span>
                        <span className="font-semibold text-foreground">{resolvedReligiousAffiliation}</span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Enhanced Enrollment Data */}
              {college.comprehensiveData && (
                <Card title="Enrollment">
                  <div className="space-y-4">
                    {college.comprehensiveData.undergraduateEnrollment && (
                      <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                        <span className="text-sm text-primary">Undergraduate</span>
                        <span className="font-bold text-blue-900">{college.comprehensiveData.undergraduateEnrollment?.toLocaleString() ?? ''}</span>
                      </div>
                    )}
                    {college.comprehensiveData.graduateEnrollment && (
                      <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                        <span className="text-sm text-purple-600">Graduate</span>
                        <span className="font-bold text-purple-900">{college.comprehensiveData.graduateEnrollment?.toLocaleString() ?? ''}</span>
                      </div>
                    )}
                    {college.comprehensiveData.totalEnrollment && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm text-muted-foreground">Total</span>
                        <span className="font-bold text-foreground">{college.comprehensiveData.totalEnrollment?.toLocaleString() ?? ''}</span>
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
          <AcademicsTab 
            college={college}
            majorCategories={majorCategories}
            academicStrengths={academicStrengths}
            programs={programs}
          />
        )}

        {/* Cost & Aid Tab */}
        {activeTab === 'cost' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Enhanced Financial Data - Handle Private vs Public Schools */}
              {college.financialData && (
                <Card title="Tuition & Costs">
                  {/* Check if it's a private school (all tuitions are the same) */}
                  {(() => {
                    const isPrivate = college.comprehensiveData?.institutionType?.toLowerCase().includes('private') ||
                                     college.type?.toLowerCase().includes('private') ||
                                     (college.financialData.tuitionInState === college.financialData.tuitionOutState &&
                                      college.financialData.tuitionInState === college.financialData.tuitionInternational);
                    
                    if (isPrivate && college.financialData.tuitionInState) {
                      // Show single tuition for private schools
                      return (
                        <div>
                          <div className="p-6 bg-muted rounded-xl text-center mb-4">
                            <DollarSign className="w-8 h-8 text-primary mx-auto mb-2" />
                            <div className="text-3xl font-bold text-primary/80">
                              ${college.financialData.tuitionInState?.toLocaleString() ?? ''}
                            </div>
                            <p className="text-primary mt-2 font-medium">Annual Tuition</p>
                            <p className="text-xs text-blue-500 mt-1">
                              Private universities charge the same tuition regardless of residency
                            </p>
                          </div>
                        </div>
                      );
                    } else {
                      // Show different tuitions for public schools
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {college.financialData.tuitionInState && (
                            <div className="p-4 bg-primary/5 rounded-xl text-center">
                              <DollarSign className="w-6 h-6 text-primary mx-auto mb-2" />
                              <div className="text-2xl font-bold text-primary">
                                ${college.financialData.tuitionInState?.toLocaleString() ?? ''}
                              </div>
                              <p className="text-sm text-primary/80 mt-1">In-State Tuition</p>
                            </div>
                          )}
                          {college.financialData.tuitionOutState && (
                            <div className="p-4 bg-purple-50 rounded-xl text-center">
                              <DollarSign className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                              <div className="text-2xl font-bold text-purple-600">
                                ${college.financialData.tuitionOutState?.toLocaleString() ?? ''}
                              </div>
                              <p className="text-sm text-purple-700 mt-1">Out-of-State Tuition</p>
                            </div>
                          )}
                          {college.financialData.tuitionInternational && (
                            <div className="p-4 bg-indigo-50 rounded-xl text-center">
                              <DollarSign className="w-6 h-6 text-indigo-600 mx-auto mb-2" />
                              <div className="text-2xl font-bold text-indigo-600">
                                ${college.financialData.tuitionInternational?.toLocaleString() ?? ''}
                              </div>
                              <p className="text-sm text-indigo-700 mt-1">International Tuition</p>
                            </div>
                          )}
                        </div>
                      );
                    }
                  })()}
                  
                  {/* Total Cost of Attendance */}
                  {college.financialData.costOfAttendance && (
                    <div className="mt-4 p-4 bg-muted rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total Cost of Attendance</span>
                        <span className="text-xl font-bold text-foreground">
                          ${college.financialData.costOfAttendance?.toLocaleString() ?? ''}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/70 mt-1">Includes tuition, room, board, and other fees</p>
                    </div>
                  )}
                </Card>
              )}

              {/* Fallback to basic tuition if comprehensive data not available */}
              {!college.financialData && formatCurrency(college.tuition_cost, college.country) && (
                <Card title="Tuition & Costs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 bg-primary/5 rounded-xl text-center">
                      <DollarSign className="w-8 h-8 text-primary mx-auto mb-2" />
                      <div className="text-3xl font-bold text-primary">
                        {formatCurrency(college.tuition_cost, college.country)}
                      </div>
                      <p className="text-primary/80 mt-1">Annual Tuition</p>
                    </div>
                    {college.country === 'Germany' && college.tuition_cost === 0 && (
                      <div className="p-6 bg-emerald-500/10 rounded-xl text-center">
                        <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                        <div className="text-3xl font-bold text-emerald-500">Free</div>
                        <p className="text-green-700 mt-1">Public University</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Financial Aid Details */}
              {(college.financialData || resolvedAvgNetPrice != null || resolvedMedianDebt != null) && (
                <Card title="Financial Aid & Net Price">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Average Net Price - prominently displayed */}
                    {resolvedAvgNetPrice != null && (
                      <div className="p-4 bg-primary/5 rounded-lg">
                        <p className="text-sm text-primary mb-1">Average Net Price</p>
                        <p className="text-2xl font-bold text-primary/80">
                          ${resolvedAvgNetPrice?.toLocaleString() ?? ''}
                        </p>
                        <p className="text-xs text-blue-500 mt-1">After grants and scholarships</p>
                      </div>
                    )}
                    {college.financialData?.percentReceivingAid && (
                      <div className="p-4 bg-emerald-500/10 rounded-lg">
                        <p className="text-sm text-emerald-500 mb-1">Students Receiving Aid</p>
                        <p className="text-2xl font-bold text-green-700">
                          {(college.financialData.percentReceivingAid * 100).toFixed(0)}%
                        </p>
                      </div>
                    )}
                    {/* Median Debt */}
                    {resolvedMedianDebt != null && (
                      <div className="p-4 bg-orange-50 rounded-lg">
                        <p className="text-sm text-orange-600 mb-1">Median Student Debt</p>
                        <p className="text-2xl font-bold text-orange-700">
                          ${resolvedMedianDebt?.toLocaleString() ?? ''}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Net Price by Income */}
              {college.financialData && (college.financialData.netPriceLowIncome || college.financialData.netPriceMidIncome || college.financialData.netPriceHighIncome) && (
                <Card title="Net Price by Income Level">
                  <div className="space-y-3">
                    {college.financialData.netPriceLowIncome && (
                      <div className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-lg">
                        <span className="text-sm text-emerald-500">Low Income ($0-$30k)</span>
                        <span className="font-bold text-green-700">${college.financialData.netPriceLowIncome?.toLocaleString() ?? ''}</span>
                      </div>
                    )}
                    {college.financialData.netPriceMidIncome && (
                      <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                        <span className="text-sm text-yellow-600">Middle Income ($30k-$75k)</span>
                        <span className="font-bold text-yellow-700">${college.financialData.netPriceMidIncome?.toLocaleString() ?? ''}</span>
                      </div>
                    )}
                    {college.financialData.netPriceHighIncome && (
                      <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                        <span className="text-sm text-primary">High Income ($75k+)</span>
                        <span className="font-bold text-primary/80">${college.financialData.netPriceHighIncome?.toLocaleString() ?? ''}</span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* India-specific: Placements */}
              {college.country === 'India' && college.placements && (
                <Card title="Placement Statistics">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {college.placements.averagePackage && (
                      <div className="p-4 bg-emerald-500/10 rounded-lg text-center">
                        <div className="text-2xl font-bold text-emerald-500">
                          ₹{(college.placements.averagePackage / 100000).toFixed(1)} LPA
                        </div>
                        <p className="text-sm text-green-700">Average Package</p>
                      </div>
                    )}
                    {college.placements.highestPackage && (
                      <div className="p-4 bg-primary/5 rounded-lg text-center">
                        <div className="text-2xl font-bold text-primary">
                          ₹{(college.placements.highestPackage / 100000).toFixed(1)} LPA
                        </div>
                        <p className="text-sm text-primary/80">Highest Package</p>
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
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-muted-foreground">
                    Financial aid information available on the official website
                  </p>
                  <a
                    href={college.official_website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm mt-2 inline-block"
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
                  <StatItem label="Location" value={[college.city, college.state, college.country].filter(Boolean).join(', ') || college.country} icon={<MapPin />} />
                  <StatItem label="Type" value={college.type || 'University'} icon={<Building />} />
                </div>
              </Card>

              {/* Student Demographics - Enhanced with flat fields support */}
              {(college.demographics || hasGenderData || hasEthnicityData || resolvedPercentInternational != null) && (
                <Card title="Student Demographics">
                  <div className="space-y-6">
                    {/* Gender Distribution - use flat fields first, fall back to genderRatio string */}
                    {hasGenderData && (
                      <div>
                        <h4 className="font-medium text-foreground mb-3">Gender Distribution</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-primary/5 rounded-lg text-center">
                            <div className="text-2xl font-bold text-primary/80">
                              {resolvedPercentMale != null
                                ? `${(resolvedPercentMale * 100).toFixed(0)}%`
                                : college.demographics?.genderRatio?.split(':')[0]
                                  ? `${college.demographics.genderRatio.split(':')[0]}%`
                                  : '—'}
                            </div>
                            <div className="text-sm text-primary">Male</div>
                          </div>
                          <div className="p-4 bg-pink-50 rounded-lg text-center">
                            <div className="text-2xl font-bold text-pink-700">
                              {resolvedPercentFemale != null
                                ? `${(resolvedPercentFemale * 100).toFixed(0)}%`
                                : college.demographics?.genderRatio?.split(':')[1]
                                  ? `${college.demographics.genderRatio.split(':')[1]}%`
                                  : '—'}
                            </div>
                            <div className="text-sm text-pink-600">Female</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Ethnic Distribution - use flat fields or ethnicDistribution object */}
                    {hasEthnicityData && (
                      <div>
                        <h4 className="font-medium text-foreground mb-3">Ethnic Diversity</h4>
                        <div className="space-y-2">
                          {Object.entries(resolvedEthnicDistribution)
                            .sort(([, a], [, b]) => b - a)
                            .map(([ethnicity, percentage]) => (
                              <div key={ethnicity} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span className="capitalize text-foreground/80">{ethnicity.replace(/_/g, ' ')}</span>
                                  <span className="font-semibold text-foreground">
                                    {(percentage * 100).toFixed(1)}%
                                  </span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-2">
                                  <div
                                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
                                    style={{ width: `${Math.min(percentage * 100, 100)}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* International Students */}
                    {resolvedPercentInternational != null && (
                      <div className="p-4 bg-primary/5 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-primary font-medium">International Students</span>
                          <Globe className="w-4 h-4 text-primary" />
                        </div>
                        <p className="text-2xl font-bold text-primary/80">
                          {(resolvedPercentInternational * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                    
                    {/* First-Generation Students */}
                    {college.demographics?.percentFirstGen && (
                      <div className="p-4 bg-emerald-500/10 rounded-lg">
                        <p className="text-sm text-emerald-500 mb-2 font-medium">First-Generation Students</p>
                        <p className="text-2xl font-bold text-green-700">
                          {(college.demographics.percentFirstGen * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Campus Life Details - Enhanced */}
              {(college.campusLife || college.comprehensiveData) && (
                <Card title="Campus Life & Setting">
                  <div className="space-y-3">
                    {/* Urban Classification */}
                    {college.comprehensiveData?.urbanClassification && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">Campus Setting</span>
                        </div>
                        <span className="font-semibold text-foreground">{college.comprehensiveData.urbanClassification}</span>
                      </div>
                    )}
                    
                    {/* Location */}
                    {(college.comprehensiveData?.city || college.city || college.state || college.country) && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">Location</span>
                        </div>
                        <span className="font-semibold text-foreground">
                          {college.comprehensiveData?.city && college.comprehensiveData?.stateRegion
                            ? `${college.comprehensiveData.city}, ${college.comprehensiveData.stateRegion}`
                            : [college.city, college.state, college.country].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                    
                    {/* Founding Year */}
                    {college.comprehensiveData?.foundingYear && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">Founded</span>
                        </div>
                        <span className="font-semibold text-foreground">{college.comprehensiveData.foundingYear}</span>
                      </div>
                    )}
                    
                    {/* Campus Size */}
                    {college.comprehensiveData?.campusSizeAcres && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <Home className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">Campus Size</span>
                        </div>
                        <span className="font-semibold text-foreground">{college.comprehensiveData.campusSizeAcres} acres</span>
                      </div>
                    )}
                    
                    {college.campusLife?.housingGuarantee && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <Home className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">Housing Guarantee</span>
                        </div>
                        <span className="font-semibold text-foreground">{college.campusLife.housingGuarantee}</span>
                      </div>
                    )}
                    {college.campusLife?.athleticsDivision && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <Award className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">Athletics</span>
                        </div>
                        <span className="font-semibold text-foreground">{college.campusLife.athleticsDivision}</span>
                      </div>
                    )}
                    {college.campusLife?.clubCount && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-primary" />
                          <span className="text-sm text-muted-foreground">Student Organizations</span>
                        </div>
                        <span className="font-semibold text-foreground">{college.campusLife.clubCount}+ clubs</span>
                      </div>
                    )}
                    {college.campusLife?.campusSafetyScore && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span className="text-sm text-muted-foreground">Campus Safety Score</span>
                        </div>
                        <span className="font-semibold text-foreground">{college.campusLife.campusSafetyScore}/10</span>
                      </div>
                    )}
                    
                    {/* Show message if no data */}
                    {!college.campusLife?.housingGuarantee && 
                     !college.campusLife?.athleticsDivision && 
                     !college.campusLife?.clubCount &&
                     !college.comprehensiveData?.urbanClassification &&
                     !college.comprehensiveData?.city && (
                      <div className="text-center p-4 text-muted-foreground/70">
                        <p className="text-sm">More student life information coming soon</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

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
                <p className="text-muted-foreground text-center p-4">
                  For detailed information about campus life, clubs, and activities, visit the official website.
                </p>
                <a
                  href={college.official_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-2 border border-border text-center rounded-lg text-foreground hover:bg-muted"
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
              {/* Graduation & Retention - use resolved fields */}
              {(resolvedGradRate4yr != null || college.academicOutcomes?.graduationRate6yr || resolvedRetentionRate != null || college.graduationRates) && (
                <Card title="Graduation Rates">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {resolvedGradRate4yr != null && (
                      <div className="text-center">
                        <div className="relative w-32 h-32 mx-auto">
                          <svg className="w-full h-full" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="#E5E7EB" strokeWidth="10" />
                            <circle 
                              cx="50" cy="50" r="45" fill="none" stroke="#10B981" strokeWidth="10"
                              strokeDasharray={`${resolvedGradRate4yr * 100 * 2.83} 283`}
                              strokeLinecap="round"
                              transform="rotate(-90 50 50)"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-2xl font-bold">{(resolvedGradRate4yr * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                        <p className="mt-2 font-medium">4-Year Graduation Rate</p>
                      </div>
                    )}
                    {(!resolvedGradRate4yr && college.graduationRates?.fourYear) && (
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
                    {college.academicOutcomes?.graduationRate6yr && (
                      <div className="text-center">
                        <div className="relative w-32 h-32 mx-auto">
                          <svg className="w-full h-full" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="#E5E7EB" strokeWidth="10" />
                            <circle 
                              cx="50" cy="50" r="45" fill="none" stroke="#3B82F6" strokeWidth="10"
                              strokeDasharray={`${college.academicOutcomes.graduationRate6yr * 100 * 2.83} 283`}
                              strokeLinecap="round"
                              transform="rotate(-90 50 50)"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-2xl font-bold">{(college.academicOutcomes.graduationRate6yr * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                        <p className="mt-2 font-medium">6-Year Graduation Rate</p>
                      </div>
                    )}
                    {(!college.academicOutcomes?.graduationRate6yr && college.graduationRates?.sixYear) && (
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
                  {resolvedRetentionRate != null && (
                    <div className="mt-6 p-4 bg-primary/5 rounded-lg">
                      <p className="text-sm text-primary mb-1">Retention Rate</p>
                      <p className="text-2xl font-bold text-primary/80">
                        {(resolvedRetentionRate * 100).toFixed(1)}%
                      </p>
                    </div>
                  )}
                </Card>
              )}

              {/* Career Outcomes - using resolved salary fields */}
              {(college.academicOutcomes?.employmentRate || resolvedSalary6yr != null || resolvedSalary10yr != null) && (
                <Card title="Career Outcomes">
                  {/* Employment and Salary Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {college.academicOutcomes?.employmentRate && (
                      <div className="p-6 bg-emerald-500/10 rounded-xl text-center">
                        <Briefcase className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                        <div className="text-3xl font-bold text-emerald-500">
                          {(college.academicOutcomes.employmentRate * 100).toFixed(0)}%
                        </div>
                        <p className="text-green-700 mt-1">Employment Rate</p>
                      </div>
                    )}
                    {resolvedSalary6yr != null && (
                      <div className="p-6 bg-primary/5 rounded-xl text-center">
                        <DollarSign className="w-8 h-8 text-primary mx-auto mb-2" />
                        <div className="text-3xl font-bold text-primary">
                          ${resolvedSalary6yr?.toLocaleString() ?? ''}
                        </div>
                        <p className="text-primary/80 mt-1">Median Salary (6 years out)</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Salary 10yr with growth % */}
                  {resolvedSalary10yr != null && (
                    <div className="space-y-4">
                      <h4 className="font-medium text-foreground">Career Salary Progression</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-purple-50 rounded-lg text-center">
                          <div className="text-2xl font-bold text-purple-600">
                            ${resolvedSalary10yr?.toLocaleString() ?? ''}
                          </div>
                          <p className="text-sm text-purple-700 mt-1">Median Salary (10 years out)</p>
                        </div>
                        
                        {/* Calculate salary growth 6yr → 10yr */}
                        {resolvedSalary6yr != null && resolvedSalary10yr != null && (
                          <div className="p-4 bg-emerald-50 rounded-lg text-center">
                            <div className="text-2xl font-bold text-emerald-600">
                              +{(((resolvedSalary10yr - resolvedSalary6yr) / resolvedSalary6yr) * 100).toFixed(0)}%
                            </div>
                            <p className="text-sm text-emerald-700 mt-1">Salary Growth</p>
                            <p className="text-xs text-emerald-600">
                              +${(resolvedSalary10yr - resolvedSalary6yr)?.toLocaleString() ?? '0'} (6yr → 10yr)
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {/* Visual salary progression bar */}
                      {resolvedSalary6yr != null && (
                        <div className="mt-4">
                          <div className="flex justify-between text-xs text-muted-foreground mb-2">
                            <span>6 Years Out</span>
                            <span>10 Years Out</span>
                          </div>
                          <div className="relative h-6 bg-muted/50 rounded-full overflow-hidden">
                            <div 
                              className="absolute h-full bg-gradient-to-r from-blue-400 to-purple-600 rounded-full flex items-center justify-end pr-2"
                              style={{ width: '100%' }}
                            >
                              <TrendingUp className="w-4 h-4 text-white" />
                            </div>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground/70 mt-1">
                            <span>${resolvedSalary6yr?.toLocaleString() ?? ''}</span>
                            <span>${resolvedSalary10yr?.toLocaleString() ?? ''}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Additional Employment Metrics */}
                  {(college.academicOutcomes?.employedAt6MonthsRate || college.academicOutcomes?.employedInFieldRate) && (
                    <div className="mt-6 pt-6 border-t border-border">
                      <h4 className="font-medium text-foreground mb-3">Employment Details</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {college.academicOutcomes?.employedAt6MonthsRate && (
                          <div className="p-3 bg-muted rounded-lg">
                            <div className="text-lg font-bold text-foreground/80">
                              {(college.academicOutcomes.employedAt6MonthsRate * 100).toFixed(0)}%
                            </div>
                            <p className="text-xs text-muted-foreground">Employed within 6 months</p>
                          </div>
                        )}
                        {college.academicOutcomes?.employedInFieldRate && (
                          <div className="p-3 bg-muted rounded-lg">
                            <div className="text-lg font-bold text-foreground/80">
                              {(college.academicOutcomes.employedInFieldRate * 100).toFixed(0)}%
                            </div>
                            <p className="text-xs text-muted-foreground">Working in their field</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* India-specific: Placements in Outcomes */}
              {college.country === 'India' && college.placements && (
                <Card title="Career Outcomes">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                      <Briefcase className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-semibold">Strong Placement Record</p>
                        <p className="text-sm text-muted-foreground">Top companies recruit from this institution</p>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card title="Career Services">
                <p className="text-muted-foreground text-sm">
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
  <div className="bg-card rounded-xl border border-border overflow-hidden">
    <div className="p-4 border-b border-border">
      <h3 className="font-semibold text-foreground">{title}</h3>
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
  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
    <div className="p-2 bg-white rounded-lg text-primary">{icon}</div>
    <div>
      <p className="text-xs text-muted-foreground/70">{label}</p>
      <p className="font-semibold text-foreground">{value}</p>
    </div>
  </div>
);

const QuickLink: React.FC<{ href: string; label: string }> = ({ href, label }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/50 transition-colors"
  >
    <span className="text-foreground/80">{label}</span>
    <ExternalLink className="w-4 h-4 text-muted-foreground/50" />
  </a>
);

const ScoreBar: React.FC<{ 
  label: string; 
  low: number; 
  high: number; 
  max: number;
  userScore?: number;
  showContext?: boolean;
}> = ({ label, low, high, max, userScore, showContext = false }) => {
  // Handle edge cases where values might be undefined or zero
  const safeLow = low || 0;
  const safeHigh = high || 0;
  const safeMax = max || 1; // Avoid division by zero
  
  const lowPercent = (safeLow / safeMax) * 100;
  const highPercent = (safeHigh / safeMax) * 100;
  const rangeWidth = Math.max(0, highPercent - lowPercent);
  const midPoint = (safeLow + safeHigh) / 2;
  
  // Calculate user score position if provided
  const userScorePercent = userScore ? (userScore / safeMax) * 100 : null;
  
  // Determine user score context
  const getUserContext = () => {
    if (!userScore) return null;
    if (userScore >= safeHigh) return { text: 'Above typical range (strong)', color: 'text-emerald-500' };
    if (userScore >= midPoint) return { text: 'Upper half of admitted students', color: 'text-primary' };
    if (userScore >= safeLow) return { text: 'Lower half of admitted students', color: 'text-yellow-600' };
    return { text: 'Below typical range (reach)', color: 'text-orange-600' };
  };
  
  const context = getUserContext();
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="font-medium">{safeLow} - {safeHigh}</span>
      </div>
      
      {/* Score bar with scale */}
      <div className="relative">
        {/* Background bar with light scale indicators */}
        <div className="relative h-4 bg-muted/50 rounded-full overflow-visible">
          {/* Middle 50% range */}
          <div 
            className="absolute h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
            style={{ left: `${lowPercent}%`, width: `${rangeWidth}%` }}
          />
          
          {/* User score marker */}
          {userScorePercent !== null && (
            <div 
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
              style={{ left: `${userScorePercent}%` }}
            >
              <div className="w-3 h-3 bg-red-500 border-2 border-white rounded-full shadow-lg" />
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-xs font-semibold bg-red-500 text-white px-1.5 py-0.5 rounded">
                  You: {userScore}
                </span>
              </div>
            </div>
          )}
        </div>
        
        {/* Scale labels */}
        <div className="flex justify-between text-xs text-muted-foreground/50 mt-1">
          <span>{max === 1600 ? '400' : '1'}</span>
          <span className="text-muted-foreground/70">25th</span>
          <span className="text-muted-foreground font-medium">Avg: {Math.round(midPoint)}</span>
          <span className="text-muted-foreground/70">75th</span>
          <span>{max}</span>
        </div>
      </div>
      
      {/* Context message for user score */}
      {showContext && context && (
        <div className={`text-sm ${context.color} flex items-center gap-1`}>
          <Target className="w-3 h-3" />
          <span>{context.text}</span>
        </div>
      )}
    </div>
  );
};

/* =========================
   Academics Tab Component with Searchable Majors
========================= */
interface IpedsMajor {
  major_id: number;
  cip_code: string;
  name: string;
  broad_category: string;
  is_stem: boolean;
  awlevel?: number;
  completions_count?: number;
}

interface AcademicsTabProps {
  college: College;
  majorCategories: string[];
  academicStrengths: string[];
  programs: string[];
}

const AcademicsTab: React.FC<AcademicsTabProps> = ({ college, majorCategories, academicStrengths, programs }) => {
  const [majorSearch, setMajorSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');

  // IPEDS-sourced majors fetched from the backend
  const [ipedsMajors, setIpedsMajors] = React.useState<IpedsMajor[] | null>(null);
  const [ipedsGrouped, setIpedsGrouped] = React.useState<Record<string, IpedsMajor[]>>({});
  const [ipedsSource, setIpedsSource] = React.useState<string>('');

  React.useEffect(() => {
    if (!college?.id) return;
    api.majors.getForCollege(college.id)
      .then((res: any) => {
        const data = res?.data ?? res;
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          setIpedsMajors(data.data);
          setIpedsGrouped(data.grouped ?? {});
          setIpedsSource(data.source ?? 'ipeds');
        }
      })
      .catch(() => { /* non-critical — fall back to programs array */ });
  }, [college?.id]);
  
  // Categorize programs for filtering
  const categorizeProgram = (program: string): string => {
    const lowerProgram = program.toLowerCase();
    if (lowerProgram.includes('engineering') || lowerProgram.includes('computer') || 
        lowerProgram.includes('technology') || lowerProgram.includes('science') ||
        lowerProgram.includes('math') || lowerProgram.includes('physics') ||
        lowerProgram.includes('chemistry') || lowerProgram.includes('biology') ||
        lowerProgram.includes('data')) return 'STEM';
    if (lowerProgram.includes('business') || lowerProgram.includes('management') ||
        lowerProgram.includes('finance') || lowerProgram.includes('accounting') ||
        lowerProgram.includes('economics') || lowerProgram.includes('marketing')) return 'Business';
    if (lowerProgram.includes('art') || lowerProgram.includes('music') ||
        lowerProgram.includes('theater') || lowerProgram.includes('design') ||
        lowerProgram.includes('film') || lowerProgram.includes('creative')) return 'Arts';
    if (lowerProgram.includes('medicine') || lowerProgram.includes('nursing') ||
        lowerProgram.includes('health') || lowerProgram.includes('pharmacy') ||
        lowerProgram.includes('dental') || lowerProgram.includes('pre-med')) return 'Health';
    if (lowerProgram.includes('psychology') || lowerProgram.includes('sociology') ||
        lowerProgram.includes('political') || lowerProgram.includes('history') ||
        lowerProgram.includes('philosophy') || lowerProgram.includes('english')) return 'Humanities';
    if (lowerProgram.includes('law') || lowerProgram.includes('legal')) return 'Law';
    if (lowerProgram.includes('education') || lowerProgram.includes('teaching')) return 'Education';
    return 'Other';
  };
  
  // Get unique categories from programs
  const programCategories = React.useMemo(() => {
    const cats = new Set(programs.map(categorizeProgram));
    return ['all', ...Array.from(cats).sort()];
  }, [programs]);
  
  // Filter programs based on search and category
  const filteredPrograms = React.useMemo(() => {
    return programs.filter(program => {
      const matchesSearch = program.toLowerCase().includes(majorSearch.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || categorizeProgram(program) === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [programs, majorSearch, selectedCategory]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Major Categories */}
        {majorCategories.length > 0 && (
          <Card title="Major Categories">
            <div className="flex flex-wrap gap-2">
              {majorCategories.map((cat, i) => (
                <span key={i} className="px-4 py-2 bg-primary/5 text-primary/80 rounded-lg font-medium">
                  {cat}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Programs/Majors with Search */}
        {/* IPEDS-sourced data takes priority when available */}
        {ipedsMajors && ipedsMajors.length > 0 ? (
          <Card title={`Majors Offered (${ipedsMajors.length}) — IPEDS verified`}>
            <div className="space-y-4">
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type="text"
                  placeholder="Search majors…"
                  value={majorSearch}
                  onChange={(e) => setMajorSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Grouped by broad_category */}
              {Object.entries(ipedsGrouped).map(([category, majors]) => {
                const filtered = majors.filter(m =>
                  m.name.toLowerCase().includes(majorSearch.toLowerCase())
                );
                if (filtered.length === 0) return null;
                return (
                  <div key={category}>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      {category} ({filtered.length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {filtered.map(major => (
                        <div
                          key={`${major.cip_code}-${major.awlevel}`}
                          className="flex items-center gap-2 p-2 hover:bg-muted rounded border border-border"
                          title={`CIP: ${major.cip_code}`}
                        >
                          <BookOpen className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                          <span className="text-sm truncate">{major.name}</span>
                          {major.is_stem && (
                            <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded shrink-0">STEM</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {ipedsMajors.filter(m =>
                m.name.toLowerCase().includes(majorSearch.toLowerCase())
              ).length === 0 && (
                <p className="text-center text-muted-foreground/70 py-4">No majors match your search</p>
              )}

              <p className="text-xs text-muted-foreground/50 mt-2">
                Data source: IPEDS Completions Survey (bachelor's &amp; master's degrees)
              </p>
            </div>
          </Card>
        ) : (
        <Card title={`Programs Offered${programs.length > 0 ? ` (${programs.length})` : ''}`}>
          {programs.length > 0 ? (
            <div className="space-y-4">
              {/* Search and Filter Bar */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <input
                    type="text"
                    placeholder="Search majors..."
                    value={majorSearch}
                    onChange={(e) => setMajorSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {programCategories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Results count */}
              <p className="text-sm text-muted-foreground/70">
                Showing {filteredPrograms.length} of {programs.length} programs
              </p>
              
              {/* Programs Grid - Accessible scrollable region */}
              <div 
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto"
                role="region"
                aria-label={`Programs list, ${filteredPrograms.length} results`}
                tabIndex={0}
              >
                {filteredPrograms.map((program, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 hover:bg-muted rounded border border-border">
                    <BookOpen className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                    <span className="text-sm truncate">{program}</span>
                  </div>
                ))}
              </div>
              
              {filteredPrograms.length === 0 && (
                <p className="text-center text-muted-foreground/70 py-4">
                  No programs match your search
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-muted-foreground">
                Program details available on the official website
              </p>
              <a 
                href={college.programs_url || college.official_website} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-primary hover:underline text-sm mt-2 inline-block"
              >
                View Programs →
              </a>
            </div>
          )}
        </Card>
        )}

        {/* Academic Stats - Only show items with values */}
        <Card title="Academic Statistics">
          <div className="flex flex-wrap gap-4">
            {college.studentFacultyRatio && (
              <div className="text-center p-4 bg-muted rounded-lg min-w-[120px]">
                <div className="text-2xl font-bold text-foreground">{college.studentFacultyRatio}</div>
                <p className="text-sm text-muted-foreground">Student:Faculty</p>
              </div>
            )}
            {college.graduationRates?.fourYear && (
              <div className="text-center p-4 bg-muted rounded-lg min-w-[120px]">
                <div className="text-2xl font-bold text-emerald-500">{college.graduationRates.fourYear}%</div>
                <p className="text-sm text-muted-foreground">4-Year Grad Rate</p>
              </div>
            )}
            {college.graduationRates?.sixYear && (
              <div className="text-center p-4 bg-muted rounded-lg min-w-[120px]">
                <div className="text-2xl font-bold text-emerald-500">{college.graduationRates.sixYear}%</div>
                <p className="text-sm text-muted-foreground">6-Year Grad Rate</p>
              </div>
            )}
            {(ipedsMajors ? ipedsMajors.length > 0 : programs.length > 0) && (
              <div className="text-center p-4 bg-muted rounded-lg min-w-[120px]">
                <div className="text-2xl font-bold text-primary">{ipedsMajors ? ipedsMajors.length : programs.length}</div>
                <p className="text-sm text-muted-foreground">Majors</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {academicStrengths.length > 0 && (
          <Card title="Academic Strengths">
            <div className="space-y-2">
              {academicStrengths.map((strength, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-emerald-500/10 rounded">
                  <Award className="w-4 h-4 text-emerald-500" />
                  <span className="text-green-700 font-medium">{strength}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CollegeDetail;
