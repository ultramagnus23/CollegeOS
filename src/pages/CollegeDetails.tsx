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
  Target
} from 'lucide-react';
import api from '../services/api';

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
   Chancing Calculator Utility
   
   This is a CONSERVATIVE, REALISTIC calculator that:
   1. Uses multi-factor weighting
   2. Respects college selectivity tiers (hard caps based on acceptance rate)
   3. Applies diminishing returns for strong profiles
   4. Never produces unrealistic results (reach schools stay reach)
========================= */
interface ChancingResult {
  chance: number;
  category: 'Safety' | 'Target' | 'Reach';
  factors: { name: string; impact: string; details: string; positive: boolean }[];
  recommendation: string;
}

// Absolute caps for highly selective schools (accounts for holistic factors we can't measure)
const HIGHLY_SELECTIVE_ABSOLUTE_CAP = 18;  // Max chance for Ivy-level schools
const VERY_SELECTIVE_ABSOLUTE_CAP = 30;    // Max chance for very selective schools

// Selectivity tier caps - no matter how strong your profile, certain colleges have hard caps
const getSelectivityCaps = (acceptanceRate: number): { minChance: number; maxChance: number; tier: string } => {
  if (acceptanceRate <= 10) {
    // Highly selective (Ivy League, MIT, Stanford level)
    return { minChance: 2, maxChance: 20, tier: 'highly_selective' };
  } else if (acceptanceRate <= 20) {
    // Very selective
    return { minChance: 5, maxChance: 35, tier: 'very_selective' };
  } else if (acceptanceRate <= 35) {
    // Selective
    return { minChance: 10, maxChance: 55, tier: 'selective' };
  } else if (acceptanceRate <= 50) {
    // Moderately selective
    return { minChance: 20, maxChance: 70, tier: 'moderate' };
  } else if (acceptanceRate <= 70) {
    // Less selective
    return { minChance: 35, maxChance: 85, tier: 'less_selective' };
  } else {
    // Open admission or very high acceptance
    return { minChance: 50, maxChance: 95, tier: 'open' };
  }
};

// Calculate factor score with diminishing returns
const calculateFactorScore = (
  studentValue: number,
  collegeLow: number,
  collegeHigh: number,
  collegeAvg?: number
): { score: number; position: string } => {
  if (!studentValue) return { score: 50, position: 'unknown' };
  
  if (studentValue >= collegeHigh) {
    // Above 75th percentile - diminishing returns above the top
    const excess = (studentValue - collegeHigh) / (collegeHigh - collegeLow);
    const bonusScore = Math.min(20, excess * 10); // Caps at +20 above 75
    return { score: 75 + bonusScore, position: 'above_75th' };
  } else if (studentValue >= collegeAvg || studentValue >= (collegeLow + collegeHigh) / 2) {
    // Between average and 75th
    const range = collegeHigh - collegeLow;
    const mid = (collegeLow + collegeHigh) / 2;
    const position = (studentValue - mid) / (collegeHigh - mid);
    return { score: 50 + position * 25, position: 'competitive' };
  } else if (studentValue >= collegeLow) {
    // Between 25th and average
    const mid = (collegeLow + collegeHigh) / 2;
    const position = (studentValue - collegeLow) / (mid - collegeLow);
    return { score: 25 + position * 25, position: 'below_avg' };
  } else {
    // Below 25th percentile - steep penalty
    const deficit = (collegeLow - studentValue) / collegeLow;
    const penaltyScore = Math.max(0, 25 - deficit * 30);
    return { score: penaltyScore, position: 'below_25th' };
  }
};

const calculateChancing = (
  userProfile: any,
  college: any
): ChancingResult | null => {
  if (!userProfile || !college) return null;
  
  const userGPA = parseFloat(userProfile.currentGPA) || 0;
  const userSAT = parseInt(userProfile.satScore) || 0;
  const userACT = parseInt(userProfile.actScore) || 0;
  
  // Normalize acceptance rate to percentage (0-100)
  let rawAcceptanceRate = college.acceptanceRate ?? college.acceptance_rate ?? 50;
  const acceptanceRate = rawAcceptanceRate <= 1 ? rawAcceptanceRate * 100 : rawAcceptanceRate;
  
  // Get selectivity-based caps - this is the KEY constraint
  const selectivityCaps = getSelectivityCaps(acceptanceRate);
  
  const collegeGPA = college.testScores?.averageGPA || 3.5;
  const collegeSATLow = college.testScores?.satRange?.percentile25 || 1200;
  const collegeSATHigh = college.testScores?.satRange?.percentile75 || 1400;
  const collegeACTLow = college.testScores?.actRange?.percentile25 || 25;
  const collegeACTHigh = college.testScores?.actRange?.percentile75 || 32;
  
  const factors: ChancingResult['factors'] = [];
  let weightedScore = 0;
  let totalWeight = 0;
  
  // Factor weights (must sum to weights that create 0-100 score)
  const WEIGHTS = {
    gpa: 0.35,
    sat: 0.30,
    act: 0.15,
    base: 0.20  // Baseline/holistic factors we don't have data for
  };
  
  // GPA factor (weight: 35%)
  if (userGPA > 0) {
    const gpaScore = calculateFactorScore(userGPA, collegeGPA - 0.4, collegeGPA + 0.2, collegeGPA);
    weightedScore += gpaScore.score * WEIGHTS.gpa;
    totalWeight += WEIGHTS.gpa;
    
    if (gpaScore.position === 'above_75th') {
      factors.push({ name: 'GPA', impact: 'Strong', details: `Your ${userGPA.toFixed(2)} GPA exceeds the typical admitted student profile`, positive: true });
    } else if (gpaScore.position === 'competitive') {
      factors.push({ name: 'GPA', impact: 'Competitive', details: `Your GPA is competitive for this school`, positive: true });
    } else if (gpaScore.position === 'below_avg') {
      factors.push({ name: 'GPA', impact: 'Below Avg', details: `Your GPA is below the average admitted student`, positive: false });
    } else if (gpaScore.position === 'below_25th') {
      factors.push({ name: 'GPA', impact: 'Low', details: `Your GPA is significantly below typical admits`, positive: false });
    }
  } else {
    // No GPA provided - assume average
    weightedScore += 50 * WEIGHTS.gpa;
    totalWeight += WEIGHTS.gpa;
  }
  
  // SAT factor (weight: 30%)
  if (userSAT > 0) {
    const satScore = calculateFactorScore(userSAT, collegeSATLow, collegeSATHigh);
    weightedScore += satScore.score * WEIGHTS.sat;
    totalWeight += WEIGHTS.sat;
    
    if (satScore.position === 'above_75th') {
      factors.push({ name: 'SAT', impact: 'Strong', details: `Your ${userSAT} SAT is at or above the 75th percentile (${collegeSATHigh})`, positive: true });
    } else if (satScore.position === 'competitive') {
      factors.push({ name: 'SAT', impact: 'Competitive', details: `Your SAT is within the competitive range`, positive: true });
    } else if (satScore.position === 'below_avg') {
      factors.push({ name: 'SAT', impact: 'Below Avg', details: `Your SAT is below the middle 50% range`, positive: false });
    } else if (satScore.position === 'below_25th') {
      factors.push({ name: 'SAT', impact: 'Low', details: `Your SAT (${userSAT}) is below the 25th percentile (${collegeSATLow})`, positive: false });
    }
  } else {
    // No SAT - use neutral baseline
    weightedScore += 50 * WEIGHTS.sat;
    totalWeight += WEIGHTS.sat;
  }
  
  // ACT factor (weight: 15%)
  if (userACT > 0) {
    const actScore = calculateFactorScore(userACT, collegeACTLow, collegeACTHigh);
    weightedScore += actScore.score * WEIGHTS.act;
    totalWeight += WEIGHTS.act;
    
    if (actScore.position === 'above_75th') {
      factors.push({ name: 'ACT', impact: 'Strong', details: `Your ${userACT} ACT is at or above the 75th percentile`, positive: true });
    } else if (actScore.position === 'competitive') {
      factors.push({ name: 'ACT', impact: 'Competitive', details: `Your ACT is competitive`, positive: true });
    } else if (actScore.position === 'below_25th') {
      factors.push({ name: 'ACT', impact: 'Low', details: `Your ACT is below typical admits`, positive: false });
    }
  } else {
    // No ACT provided - use SAT or neutral
    weightedScore += 50 * WEIGHTS.act;
    totalWeight += WEIGHTS.act;
  }
  
  // Baseline for holistic factors we don't have data on (essays, ECs, LORs)
  // Assume average/competitive student for unknown factors
  weightedScore += 50 * WEIGHTS.base;
  totalWeight += WEIGHTS.base;
  
  // Calculate normalized score (0-100)
  const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 50;
  
  // Map the normalized score to the selectivity-constrained chance
  // This is where the HARD CAPS come in
  const scoreRange = selectivityCaps.maxChance - selectivityCaps.minChance;
  let rawChance = selectivityCaps.minChance + (normalizedScore / 100) * scoreRange;
  
  // Apply additional penalty for highly selective schools
  // Even with perfect stats, there's significant randomness/holistic factors
  if (selectivityCaps.tier === 'highly_selective') {
    // For Ivy-level schools, cap maximum chance more aggressively
    rawChance = Math.min(rawChance, HIGHLY_SELECTIVE_ABSOLUTE_CAP);
    factors.push({ 
      name: 'Selectivity', 
      impact: 'Very High', 
      details: `Acceptance rate is ${acceptanceRate.toFixed(1)}% - holistic review makes outcomes uncertain`, 
      positive: false 
    });
  } else if (selectivityCaps.tier === 'very_selective') {
    rawChance = Math.min(rawChance, VERY_SELECTIVE_ABSOLUTE_CAP);
  }
  
  // Final chance with proper bounds
  const finalChance = Math.min(95, Math.max(2, Math.round(rawChance)));
  
  // Determine category based on chance AND acceptance rate
  // A school with 5% acceptance is ALWAYS a reach, even with high computed chance
  let category: ChancingResult['category'];
  let recommendation: string;
  
  if (acceptanceRate <= 15) {
    // Highly selective schools are almost always reach
    category = 'Reach';
    recommendation = finalChance >= 15 
      ? 'Very competitive school. Your stats are strong, but holistic review means outcomes are uncertain.'
      : 'Highly competitive. Consider focusing on essays and unique factors to stand out.';
  } else if (acceptanceRate <= 30) {
    // Very selective - can be target with excellent stats
    if (finalChance >= 35) {
      category = 'Target';
      recommendation = 'Solid match! Your profile aligns well with admitted students.';
    } else {
      category = 'Reach';
      recommendation = 'Competitive school. Strong profile needed for best chances.';
    }
  } else if (acceptanceRate <= 50) {
    // Moderate selectivity
    if (finalChance >= 55) {
      category = 'Safety';
      recommendation = 'Good safety choice. Your profile is strong for this school.';
    } else if (finalChance >= 35) {
      category = 'Target';
      recommendation = 'Good match! Your profile is competitive for this school.';
    } else {
      category = 'Reach';
      recommendation = 'Consider strengthening your application for better chances.';
    }
  } else {
    // Less selective
    if (finalChance >= 65) {
      category = 'Safety';
      recommendation = 'Strong safety school. High likelihood of acceptance.';
    } else if (finalChance >= 45) {
      category = 'Target';
      recommendation = 'Good match with reasonable chances of admission.';
    } else {
      category = 'Reach';
      recommendation = 'Review your profile for this school\'s requirements.';
    }
  }
  
  return { chance: finalChance, category, factors, recommendation };
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
  official_website: string;
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
    act25?: number | null;
    act50?: number | null;
    act75?: number | null;
    source?: string;
  };
  financialData?: {
    year?: number;
    tuitionInState?: number | null;
    tuitionOutState?: number | null;
    tuitionInternational?: number | null;
    costOfAttendance?: number | null;
    avgFinancialAid?: number | null;
    percentReceivingAid?: number | null;
    avgDebt?: number | null;
    netPriceLowIncome?: number | null;
    netPriceMidIncome?: number | null;
    netPriceHighIncome?: number | null;
    source?: string;
  };
  academicOutcomes?: {
    year?: number;
    graduationRate4yr?: number | null;
    graduationRate6yr?: number | null;
    retentionRate?: number | null;
    employmentRate?: number | null;
    medianStartSalary?: number | null;
    source?: string;
  };
  demographics?: {
    year?: number;
    percentInternational?: number | null;
    genderRatio?: string | null;
    ethnicDistribution?: Record<string, number>;
    percentFirstGen?: number | null;
    source?: string;
  };
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
    return num.toLocaleString();
  };

  // Get user profile from localStorage for chancing
  const getUserProfile = () => {
    try {
      const stored = localStorage.getItem('studentProfile');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const userProfile = getUserProfile();
  const chancingResult = calculateChancing(userProfile, college);

  const acceptanceRate = college.acceptanceRate ?? college.acceptance_rate;
  const testScores = college.testScores || {};
  
  // Get dynamic gradient based on country
  const heroGradient = getCountryGradient(college.country);

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

            <div className="flex flex-col items-end gap-3">
              <button
                onClick={handleAddCollege}
                disabled={adding}
                className="px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold disabled:opacity-50 hover:bg-blue-50 transition-colors"
              >
                {adding ? 'Adding…' : '+ Add to My List'}
              </button>
              
              {/* Chancing Card */}
              {chancingResult && (
                <div className={`px-4 py-2 rounded-lg font-medium ${
                  chancingResult.category === 'Safety' ? 'bg-green-400 text-green-900' :
                  chancingResult.category === 'Target' ? 'bg-yellow-400 text-yellow-900' :
                  'bg-red-400 text-red-900'
                }`}>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    <span>{chancingResult.chance}% - {chancingResult.category}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats Bar - Only show stats with values */}
          <div className="flex flex-wrap gap-4 mt-8 bg-white/10 rounded-xl p-4">
            {(() => {
              const acceptanceRateStr = formatAcceptanceRate(acceptanceRate);
              return acceptanceRateStr && <QuickStat label="Acceptance Rate" value={acceptanceRateStr} />;
            })()}
            {(() => {
              const enrollmentStr = formatEnrollment(college.enrollment);
              return enrollmentStr && <QuickStat label="Enrollment" value={enrollmentStr} />;
            })()}
            {(() => {
              const tuitionStr = formatCurrency(college.tuition_cost, college.country);
              return tuitionStr && <QuickStat label="Tuition" value={tuitionStr} />;
            })()}
            {testScores.averageGPA && (
              <QuickStat label="Avg GPA" value={testScores.averageGPA.toFixed(2)} />
            )}
            {college.studentFacultyRatio && (
              <QuickStat label="Student:Faculty" value={college.studentFacultyRatio} />
            )}
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
        {/* Chancing Section - Show prominently if available */}
        {chancingResult && (
          <div className={`mb-6 p-4 rounded-xl border-2 ${
            chancingResult.category === 'Safety' ? 'bg-green-50 border-green-200' :
            chancingResult.category === 'Target' ? 'bg-yellow-50 border-yellow-200' :
            'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`text-4xl font-bold ${
                  chancingResult.category === 'Safety' ? 'text-green-600' :
                  chancingResult.category === 'Target' ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {chancingResult.chance}%
                </div>
                <div>
                  <div className={`text-lg font-semibold ${
                    chancingResult.category === 'Safety' ? 'text-green-800' :
                    chancingResult.category === 'Target' ? 'text-yellow-800' :
                    'text-red-800'
                  }`}>
                    {chancingResult.category} School
                  </div>
                  <p className="text-sm text-gray-600">{chancingResult.recommendation}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {chancingResult.factors.slice(0, 3).map((factor, i) => (
                  <span key={i} className={`px-2 py-1 rounded text-xs font-medium ${
                    factor.positive ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {factor.name}: {factor.impact}
                  </span>
                ))}
              </div>
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
                  <p className="text-gray-700 leading-relaxed">{college.description}</p>
                </Card>
              )}

              {/* Key Stats - Only show items with values */}
              <Card title="Key Statistics">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {(() => {
                    const acceptanceRateStr = formatAcceptanceRate(acceptanceRate);
                    return acceptanceRateStr && <StatItem label="Acceptance Rate" value={acceptanceRateStr} icon={<TrendingUp />} />;
                  })()}
                  {(() => {
                    const enrollmentStr = formatEnrollment(college.enrollment);
                    return enrollmentStr && <StatItem label="Total Enrollment" value={enrollmentStr} icon={<Users />} />;
                  })()}
                  {college.studentFacultyRatio && (
                    <StatItem label="Student:Faculty Ratio" value={college.studentFacultyRatio} icon={<GraduationCap />} />
                  )}
                  {college.graduationRates?.fourYear && (
                    <StatItem label="4-Year Grad Rate" value={`${college.graduationRates.fourYear}%`} icon={<Award />} />
                  )}
                  {college.graduationRates?.sixYear && (
                    <StatItem label="6-Year Grad Rate" value={`${college.graduationRates.sixYear}%`} icon={<Award />} />
                  )}
                  {college.type && (
                    <StatItem label="Institution Type" value={college.type} icon={<Building />} />
                  )}
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
                        style={{ width: `${Math.min(acceptanceRate != null ? (acceptanceRate <= 1 ? acceptanceRate * 100 : acceptanceRate) : 0, 100)}%` }}
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
                    {Object.entries(college.deadlineTemplates)
                      .filter(([, deadline]) => deadline !== null)
                      .map(([key, deadline]) => (
                      <div key={key} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Calendar className="w-5 h-5 text-blue-600" />
                          <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        </div>
                        <span className="text-gray-700">
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

              {/* Rankings - Display if available */}
              {college.rankings && college.rankings.length > 0 && (
                <Card title="University Rankings">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {college.rankings.map((ranking, index) => (
                      <div key={index} className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-blue-600">{ranking.rankingBody}</p>
                          <Award className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="space-y-1">
                          {ranking.nationalRank && (
                            <p className="text-2xl font-bold text-gray-900">#{ranking.nationalRank}</p>
                          )}
                          {ranking.globalRank && !ranking.nationalRank && (
                            <p className="text-2xl font-bold text-gray-900">#{ranking.globalRank}</p>
                          )}
                          <p className="text-xs text-gray-500">
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
                    {college.comprehensiveData.institutionType && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-600">Type</span>
                        <span className="font-semibold text-gray-900">{college.comprehensiveData.institutionType}</span>
                      </div>
                    )}
                    {college.comprehensiveData.classification && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-600">Classification</span>
                        <span className="font-semibold text-gray-900">{college.comprehensiveData.classification}</span>
                      </div>
                    )}
                    {college.comprehensiveData.urbanClassification && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-600">Setting</span>
                        <span className="font-semibold text-gray-900">{college.comprehensiveData.urbanClassification}</span>
                      </div>
                    )}
                    {college.comprehensiveData.foundingYear && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-600">Founded</span>
                        <span className="font-semibold text-gray-900">{college.comprehensiveData.foundingYear}</span>
                      </div>
                    )}
                    {college.comprehensiveData.campusSizeAcres && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-600">Campus Size</span>
                        <span className="font-semibold text-gray-900">{college.comprehensiveData.campusSizeAcres} acres</span>
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
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <span className="text-sm text-blue-600">Undergraduate</span>
                        <span className="font-bold text-blue-900">{college.comprehensiveData.undergraduateEnrollment.toLocaleString()}</span>
                      </div>
                    )}
                    {college.comprehensiveData.graduateEnrollment && (
                      <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                        <span className="text-sm text-purple-600">Graduate</span>
                        <span className="font-bold text-purple-900">{college.comprehensiveData.graduateEnrollment.toLocaleString()}</span>
                      </div>
                    )}
                    {college.comprehensiveData.totalEnrollment && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-600">Total</span>
                        <span className="font-bold text-gray-900">{college.comprehensiveData.totalEnrollment.toLocaleString()}</span>
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
              {/* Enhanced Financial Data */}
              {college.financialData && (
                <Card title="Tuition & Costs">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {college.financialData.tuitionInState && (
                      <div className="p-4 bg-blue-50 rounded-xl text-center">
                        <DollarSign className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-blue-600">
                          ${college.financialData.tuitionInState.toLocaleString()}
                        </div>
                        <p className="text-sm text-blue-700 mt-1">In-State Tuition</p>
                      </div>
                    )}
                    {college.financialData.tuitionOutState && (
                      <div className="p-4 bg-purple-50 rounded-xl text-center">
                        <DollarSign className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-purple-600">
                          ${college.financialData.tuitionOutState.toLocaleString()}
                        </div>
                        <p className="text-sm text-purple-700 mt-1">Out-of-State Tuition</p>
                      </div>
                    )}
                    {college.financialData.tuitionInternational && (
                      <div className="p-4 bg-indigo-50 rounded-xl text-center">
                        <DollarSign className="w-6 h-6 text-indigo-600 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-indigo-600">
                          ${college.financialData.tuitionInternational.toLocaleString()}
                        </div>
                        <p className="text-sm text-indigo-700 mt-1">International Tuition</p>
                      </div>
                    )}
                    {college.financialData.costOfAttendance && (
                      <div className="p-4 bg-red-50 rounded-xl text-center">
                        <DollarSign className="w-6 h-6 text-red-600 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-red-600">
                          ${college.financialData.costOfAttendance.toLocaleString()}
                        </div>
                        <p className="text-sm text-red-700 mt-1">Total Cost</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Fallback to basic tuition if comprehensive data not available */}
              {!college.financialData && formatCurrency(college.tuition_cost, college.country) && (
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
              )}

              {/* Financial Aid Details */}
              {college.financialData && (college.financialData.avgFinancialAid || college.financialData.percentReceivingAid) && (
                <Card title="Financial Aid">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {college.financialData.avgFinancialAid && (
                      <div className="p-4 bg-green-50 rounded-lg">
                        <p className="text-sm text-green-600 mb-1">Average Aid Package</p>
                        <p className="text-2xl font-bold text-green-700">
                          ${college.financialData.avgFinancialAid.toLocaleString()}
                        </p>
                      </div>
                    )}
                    {college.financialData.percentReceivingAid && (
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-600 mb-1">Students Receiving Aid</p>
                        <p className="text-2xl font-bold text-blue-700">
                          {(college.financialData.percentReceivingAid * 100).toFixed(0)}%
                        </p>
                      </div>
                    )}
                    {college.financialData.avgDebt && (
                      <div className="p-4 bg-orange-50 rounded-lg">
                        <p className="text-sm text-orange-600 mb-1">Average Student Debt</p>
                        <p className="text-2xl font-bold text-orange-700">
                          ${college.financialData.avgDebt.toLocaleString()}
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
                      <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <span className="text-sm text-green-600">Low Income ($0-$30k)</span>
                        <span className="font-bold text-green-700">${college.financialData.netPriceLowIncome.toLocaleString()}</span>
                      </div>
                    )}
                    {college.financialData.netPriceMidIncome && (
                      <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                        <span className="text-sm text-yellow-600">Middle Income ($30k-$75k)</span>
                        <span className="font-bold text-yellow-700">${college.financialData.netPriceMidIncome.toLocaleString()}</span>
                      </div>
                    )}
                    {college.financialData.netPriceHighIncome && (
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <span className="text-sm text-blue-600">High Income ($75k+)</span>
                        <span className="font-bold text-blue-700">${college.financialData.netPriceHighIncome.toLocaleString()}</span>
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

              {/* Student Demographics */}
              {college.demographics && (
                <Card title="Student Demographics">
                  <div className="space-y-4">
                    {college.demographics.percentInternational && (
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-blue-600">International Students</span>
                          <Globe className="w-4 h-4 text-blue-600" />
                        </div>
                        <p className="text-2xl font-bold text-blue-700">
                          {(college.demographics.percentInternational * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                    {college.demographics.genderRatio && (
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <p className="text-sm text-purple-600 mb-2">Gender Ratio</p>
                        <p className="text-lg font-bold text-purple-700">{college.demographics.genderRatio}</p>
                      </div>
                    )}
                    {college.demographics.percentFirstGen && (
                      <div className="p-4 bg-green-50 rounded-lg">
                        <p className="text-sm text-green-600 mb-2">First-Generation Students</p>
                        <p className="text-2xl font-bold text-green-700">
                          {(college.demographics.percentFirstGen * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Campus Life Details */}
              {college.campusLife && (
                <Card title="Campus Life">
                  <div className="space-y-3">
                    {college.campusLife.housingGuarantee && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Home className="w-4 h-4 text-blue-600" />
                          <span className="text-sm text-gray-600">Housing Guarantee</span>
                        </div>
                        <span className="font-semibold text-gray-900">{college.campusLife.housingGuarantee}</span>
                      </div>
                    )}
                    {college.campusLife.athleticsDivision && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Award className="w-4 h-4 text-blue-600" />
                          <span className="text-sm text-gray-600">Athletics</span>
                        </div>
                        <span className="font-semibold text-gray-900">{college.campusLife.athleticsDivision}</span>
                      </div>
                    )}
                    {college.campusLife.clubCount && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-blue-600" />
                          <span className="text-sm text-gray-600">Student Organizations</span>
                        </div>
                        <span className="font-semibold text-gray-900">{college.campusLife.clubCount}+ clubs</span>
                      </div>
                    )}
                    {college.campusLife.campusSafetyScore && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-gray-600">Campus Safety Score</span>
                        </div>
                        <span className="font-semibold text-gray-900">{college.campusLife.campusSafetyScore}/10</span>
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
              {/* Enhanced Academic Outcomes */}
              {college.academicOutcomes && (
                <>
                  <Card title="Graduation Rates">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {college.academicOutcomes.graduationRate4yr && (
                        <div className="text-center">
                          <div className="relative w-32 h-32 mx-auto">
                            <svg className="w-full h-full" viewBox="0 0 100 100">
                              <circle cx="50" cy="50" r="45" fill="none" stroke="#E5E7EB" strokeWidth="10" />
                              <circle 
                                cx="50" cy="50" r="45" fill="none" stroke="#10B981" strokeWidth="10"
                                strokeDasharray={`${college.academicOutcomes.graduationRate4yr * 100 * 2.83} 283`}
                                strokeLinecap="round"
                                transform="rotate(-90 50 50)"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-2xl font-bold">{(college.academicOutcomes.graduationRate4yr * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          <p className="mt-2 font-medium">4-Year Graduation Rate</p>
                        </div>
                      )}
                      {college.academicOutcomes.graduationRate6yr && (
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
                              <span className="text-2xl font-bold">{(college.academicOutcomes.graduationRate6yr * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          <p className="mt-2 font-medium">6-Year Graduation Rate</p>
                        </div>
                      )}
                    </div>
                    {college.academicOutcomes.retentionRate && (
                      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-600 mb-1">Retention Rate</p>
                        <p className="text-2xl font-bold text-blue-700">
                          {(college.academicOutcomes.retentionRate * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                  </Card>

                  {/* Career Outcomes */}
                  {(college.academicOutcomes.employmentRate || college.academicOutcomes.medianStartSalary) && (
                    <Card title="Career Outcomes">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {college.academicOutcomes.employmentRate && (
                          <div className="p-6 bg-green-50 rounded-xl text-center">
                            <Briefcase className="w-8 h-8 text-green-600 mx-auto mb-2" />
                            <div className="text-3xl font-bold text-green-600">
                              {(college.academicOutcomes.employmentRate * 100).toFixed(0)}%
                            </div>
                            <p className="text-green-700 mt-1">Employment Rate</p>
                          </div>
                        )}
                        {college.academicOutcomes.medianStartSalary && (
                          <div className="p-6 bg-blue-50 rounded-xl text-center">
                            <DollarSign className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                            <div className="text-3xl font-bold text-blue-600">
                              ${college.academicOutcomes.medianStartSalary.toLocaleString()}
                            </div>
                            <p className="text-blue-700 mt-1">Median Starting Salary</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}
                </>
              )}

              {/* Fallback to legacy graduation rates if comprehensive data not available */}
              {!college.academicOutcomes && college.graduationRates && (
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
              )}

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
  // Handle edge cases where values might be undefined or zero
  const safeLow = low || 0;
  const safeHigh = high || 0;
  const safeMax = max || 1; // Avoid division by zero
  
  const lowPercent = (safeLow / safeMax) * 100;
  const highPercent = (safeHigh / safeMax) * 100;
  const rangeWidth = Math.max(0, highPercent - lowPercent);
  
  return (
    <div>
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{label}</span>
        <span className="font-medium">{safeLow} - {safeHigh}</span>
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

/* =========================
   Academics Tab Component with Searchable Majors
========================= */
interface AcademicsTabProps {
  college: College;
  majorCategories: string[];
  academicStrengths: string[];
  programs: string[];
}

const AcademicsTab: React.FC<AcademicsTabProps> = ({ college, majorCategories, academicStrengths, programs }) => {
  const [majorSearch, setMajorSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  
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
                <span key={i} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium">
                  {cat}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Programs/Majors with Search */}
        <Card title={`Programs Offered${programs.length > 0 ? ` (${programs.length})` : ''}`}>
          {programs.length > 0 ? (
            <div className="space-y-4">
              {/* Search and Filter Bar */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search majors..."
                    value={majorSearch}
                    onChange={(e) => setMajorSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {programCategories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Results count */}
              <p className="text-sm text-gray-500">
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
                  <div key={i} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded border border-gray-100">
                    <BookOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm truncate">{program}</span>
                  </div>
                ))}
              </div>
              
              {filteredPrograms.length === 0 && (
                <p className="text-center text-gray-500 py-4">
                  No programs match your search
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">
                Program details available on the official website
              </p>
              <a 
                href={college.programs_url || college.official_website} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 hover:underline text-sm mt-2 inline-block"
              >
                View Programs →
              </a>
            </div>
          )}
        </Card>

        {/* Academic Stats - Only show items with values */}
        <Card title="Academic Statistics">
          <div className="flex flex-wrap gap-4">
            {college.studentFacultyRatio && (
              <div className="text-center p-4 bg-gray-50 rounded-lg min-w-[120px]">
                <div className="text-2xl font-bold text-gray-900">{college.studentFacultyRatio}</div>
                <p className="text-sm text-gray-600">Student:Faculty</p>
              </div>
            )}
            {college.graduationRates?.fourYear && (
              <div className="text-center p-4 bg-gray-50 rounded-lg min-w-[120px]">
                <div className="text-2xl font-bold text-green-600">{college.graduationRates.fourYear}%</div>
                <p className="text-sm text-gray-600">4-Year Grad Rate</p>
              </div>
            )}
            {college.graduationRates?.sixYear && (
              <div className="text-center p-4 bg-gray-50 rounded-lg min-w-[120px]">
                <div className="text-2xl font-bold text-green-600">{college.graduationRates.sixYear}%</div>
                <p className="text-sm text-gray-600">6-Year Grad Rate</p>
              </div>
            )}
            {programs.length > 0 && (
              <div className="text-center p-4 bg-gray-50 rounded-lg min-w-[120px]">
                <div className="text-2xl font-bold text-blue-600">{programs.length}</div>
                <p className="text-sm text-gray-600">Programs</p>
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
  );
};

export default CollegeDetail;
