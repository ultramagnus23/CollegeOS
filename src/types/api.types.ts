// src/types/api.types.ts
// Complete TypeScript type definitions for CollegeApp
// This bridges the JavaScript backend with TypeScript frontend

// ==================== USER TYPES ====================

export interface User {
  id: number;
  email: string;
  name: string;
  
  // Academic Profile
  academic_board?: 'CBSE' | 'ISC' | 'IB' | 'ICSE' | 'State Board' | 'Other';
  grade_level?: '11th' | '12th' | 'Graduate' | 'Gap Year';
  graduation_year?: number;
  subjects?: string[];
  percentage?: number;
  gpa?: number;
  medium_of_instruction?: string;
  
  // Exams
  exams_taken?: Record<string, ExamData>;
  
  // Financial
  max_budget_per_year?: number; // in INR
  can_take_loan?: boolean;
  need_financial_aid?: boolean;
  
  // Preferences
  target_countries?: string[];
  intended_major?: string;
  career_goals?: string;
  location_preference?: string;
  university_size?: string;
  
  // Status
  onboarding_completed?: boolean;
  profile_completed?: boolean;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface ExamData {
  status: 'not_planned' | 'planned' | 'registered' | 'completed' | 'cancelled';
  score?: string | number;
  target_date?: string;
  date?: string;
}

// ==================== COLLEGE TYPES ====================

export interface College {
  id: number;
  name: string;
  country: string;
  location: string;
  type: 'Public' | 'Private' | 'Liberal Arts';
  application_portal: string;
  acceptance_rate: number;
  
  // Programs & Requirements
  programs: string[];
  requirements: CollegeRequirements;
  deadline_templates: DeadlineTemplates;
  
  // Research Data
  research_data: ResearchData;
  
  // Additional Info
  description: string;
  website_url: string;
  logo_url?: string;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface CollegeRequirements {
  accepted_boards?: string[];
  required_subjects?: string[];
  recommended_subjects?: string[];
  required_exams?: string[];
  optional_exams?: string[];
  language_exams?: string[];
  min_percentage?: number;
  min_gpa?: number;
  min_toefl?: number;
  min_ielts?: number;
  min_scores?: Record<string, number>;
  test_optional?: boolean;
  essay_required?: boolean;
  lors_required?: boolean;
  interview?: boolean;
  holistic_review?: boolean;
  programs?: Record<string, ProgramRequirements>;
}

export interface ProgramRequirements {
  required_subjects?: string[];
  recommended_subjects?: string[];
  min_percentage?: number;
  additional_requirements?: string[];
}

export interface DeadlineTemplates {
  early_action?: string;
  early_decision?: string;
  regular_decision?: string;
  financial_aid?: string;
  enrollment_deposit?: string;
  ucas_deadline?: string;
  application_deadline?: string;
}

export interface ResearchData {
  aid_available?: boolean;
  indian_students?: number;
  avg_cost?: number;
  aid_percentage?: number;
  employment_rate?: number;
  avg_salary?: number;
  visa_acceptance?: string;
}

// ==================== APPLICATION TYPES ====================

export interface Application {
  id: number;
  user_id: number;
  college_id: number;
  
  // Related Data (joined from other tables)
  college_name?: string;
  country?: string;
  location?: string;
  logo_url?: string;
  
  // Application Status
  status: 'planning' | 'in_progress' | 'submitted' | 'accepted' | 'rejected' | 'waitlisted';
  application_type: 'early_action' | 'early_decision' | 'regular' | 'rolling';
  
  // Important Dates
  submission_date?: string;
  decision_date?: string;
  
  // Components Tracking
  essay_completed: boolean;
  recommendation_letters_sent: boolean;
  transcripts_sent: boolean;
  test_scores_sent: boolean;
  
  // Additional
  notes?: string;
  total_deadlines?: number;
  pending_deadlines?: number;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

// ==================== DEADLINE TYPES ====================

export interface Deadline {
  id: number;
  user_id: number;
  application_id: number;
  college_id: number;
  
  // Related Data
  college_name?: string;
  logo_url?: string;
  application_status?: string;
  
  // Deadline Info
  title: string;
  description?: string;
  deadline_date: string;
  deadline_type: 'application' | 'financial_aid' | 'housing' | 'enrollment' | 'transcript';
  
  // Status
  completed: boolean;
  completed_date?: string;
  
  // Priority
  priority: 'low' | 'medium' | 'high' | 'critical';
  is_optional: boolean;
  
  // Computed Fields
  days_until?: number;
  is_overdue?: boolean;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

// ==================== ELIGIBILITY TYPES ====================

export interface EligibilityResult {
  eligible: boolean;
  status: 'eligible' | 'conditional' | 'not_eligible';
  issues: EligibilityIssue[];
  warnings: EligibilityWarning[];
  recommendations: EligibilityRecommendation[];
  details: Record<string, any>;
}

export interface EligibilityIssue {
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  subject?: string;
  exam?: string;
}

export interface EligibilityWarning {
  type: string;
  message: string;
  field?: string;
  subject?: string;
  exam?: string;
  exams?: string[];
}

export interface EligibilityRecommendation {
  type: string;
  message: string;
}

// ==================== RECOMMENDATION TYPES ====================

export interface Recommendation {
  college: College;
  eligibility: EligibilityResult;
  scores: RecommendationScores;
  classification: 'REACH' | 'TARGET' | 'SAFETY';
  financial_fit: FinancialFit;
  overall_fit_score: number;
  why_recommended: string[];
  concerns: string[];
  application_effort: ApplicationEffort;
}

export interface RecommendationScores {
  eligibility_score: number;
  academic_fit: number;
  program_strength: number;
  cost_affordability: number;
  outcome_quality: number;
  application_feasibility: number;
}

export interface FinancialFit {
  tuition_inr: number;
  living_cost_inr: number;
  total_per_year: number;
  four_year_total: number;
  within_budget: boolean;
  needs_aid: boolean;
  aid_available: boolean;
  can_work_part_time: boolean;
  estimated_work_earnings: number;
  effective_cost: number;
  affordability: 'AFFORDABLE' | 'STRETCH';
}

export interface ApplicationEffort {
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  hours: string;
}

export interface RecommendationStats {
  total: number;
  reach: number;
  target: number;
  safety: number;
  within_budget: number;
  fully_eligible: number;
  conditional: number;
  avg_fit_score: number;
  countries: Record<string, number>;
}

// ==================== TIMELINE TYPES ====================

export interface TimelineAction {
  id: number;
  user_id: number;
  
  // Action Details
  title: string;
  description: string;
  category: 'exam_prep' | 'college_research' | 'application' | 'financial_aid' | 'documents';
  
  // Timing
  target_month: number;
  target_year: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  // Status
  completed: boolean;
  completed_date?: string;
  
  // Context
  related_country?: string;
  related_college_id?: number;
  related_deadline_id?: number;
  is_system_generated: boolean;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface MonthlyTimeline {
  month: number;
  year: number;
  actions: TimelineAction[];
  deadlines_count: number;
  exams_scheduled: number;
}

// ==================== ESSAY TYPES ====================

export interface Essay {
  id: number;
  user_id: number;
  college_id?: number;
  application_id?: number;
  
  // Essay Details
  title: string;
  prompt: string;
  content: string;
  word_count: number;
  max_words?: number;
  
  // Status
  status: 'draft' | 'in_progress' | 'completed' | 'submitted';
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

// ==================== API RESPONSE TYPES ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T> {
  pagination?: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
  total?: number;
  filtered?: number;
}

// ==================== DASHBOARD TYPES ====================

export interface DashboardStats {
  applications: number;
  upcoming_deadlines: number;
  overdue: number;
  completed: number;
  this_week: number;
  this_month: number;
}

export interface DashboardData {
  stats: DashboardStats;
  upcoming_deadlines: Deadline[];
  recent_applications: Application[];
  timeline_actions: TimelineAction[];
}

// ==================== RESEARCH TYPES ====================

export interface ResearchCache {
  id: number;
  college_id: number;
  category: string;
  content: string;
  source_url?: string;
  created_at: string;
  updated_at: string;
}

// ==================== AUTH TYPES ====================

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends AuthCredentials {
  name: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}

// ==================== FILTER & SEARCH TYPES ====================

export interface CollegeFilters {
  country?: string;
  program?: string;
  searchTerm?: string;
  page?: number;
  limit?: number;
  classification?: 'all' | 'REACH' | 'TARGET' | 'SAFETY';
  within_budget?: boolean;
  eligibility?: 'all' | 'eligible' | 'conditional';
  sort?: 'fit' | 'cost' | 'ranking' | 'acceptance';
}

export interface DeadlineFilters {
  status?: 'upcoming' | 'completed' | 'all';
  college_id?: number;
  limit?: number;
}

// ==================== FORM TYPES ====================

export interface OnboardingProfile {
  // Academic
  academic_board: string;
  grade_level: string;
  graduation_year: number;
  subjects: string[];
  percentage: string;
  gpa: string;
  
  // Exams
  exams_taken: Record<string, ExamData>;
  
  // Financial
  max_budget_per_year: string;
  can_take_loan: boolean;
  need_financial_aid: boolean;
  
  // Preferences
  target_countries: string[];
  intended_major: string;
  career_goals: string;
  location_preference: string;
  university_size: string;
}

// ==================== ERROR TYPES ====================

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

export class AppError extends Error {
  code: string;
  details?: any;
  
  constructor(message: string, code: string = 'UNKNOWN_ERROR', details?: any) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'AppError';
  }
}