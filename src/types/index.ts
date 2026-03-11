// Core application types with trust-first philosophy

export type TrustTier = 'official' | 'secondary' | 'forum' | 'unverified';

// Shared filter option types
export interface CountryOption {
  value: string;
  label: string;
  count: number;
}

// Utility function to normalize country data from API
export function normalizeCountryData(countryData: (string | CountryOption)[]): string[] {
  return countryData.map((c) => 
    typeof c === 'string' ? c : c.value
  );
}

export interface DataSource {
  url: string;
  tier: TrustTier;
  accessedAt: Date;
  label?: string;
}

export interface VerifiedData<T> {
  value: T | null;
  source: DataSource | null;
  lastVerified: Date | null;
}

export type ApplicationStatus = 
  | 'researching'
  | 'planning'
  | 'in_progress'
  | 'submitted'
  | 'interview'
  | 'decision_pending'
  | 'accepted'
  | 'rejected'
  | 'waitlisted'
  | 'withdrawn';

export type DeadlineType = 
  | 'early_decision'
  | 'early_action'
  | 'regular'
  | 'rolling'
  | 'priority'
  | 'scholarship';

export interface Deadline {
  id: string;
  type: DeadlineType;
  date: Date | null;
  source: DataSource | null;
  notes?: string;
}

// Trust-first college type used by mock data and verified-data components
export interface VerifiedCollege {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  city?: string;
  officialWebsite: string;
  admissionsUrl?: string;
  logoUrl?: string;
  
  // All data with verification
  deadlines: Deadline[];
  requirements: VerifiedData<string[]>;
  testPolicy: VerifiedData<string>;
  applicationFee: VerifiedData<string>;
  acceptanceRate: VerifiedData<number>;
  
  // Flags for special requirements
  hasPortfolioRequirement: boolean;
  hasInterviewRequirement: boolean;
  hasLanguageRequirement: boolean;
  requiresFinancialDocs: boolean;
  
  lastUpdated: Date;
}

// Shared College interface used across pages — matches API response shape
export interface College {
  id: number;
  name: string;
  location: string;
  country: string;
  type: string;
  acceptance_rate?: number | null;
  acceptanceRate?: number | null;
  programs: string[];
  majorCategories?: string[];
  academicStrengths?: string[];
  description?: string | null;
  tuition_cost?: number | null;
  enrollment?: number | null;
  ranking?: number | null;
  averageGPA?: number | null;
  testScores?: TestScores;
  graduationRates?: GraduationRates | null;
  studentFacultyRatio?: string | null;
  official_website?: string;
  updated_at?: string;
  last_scraped?: string;
  is_verified?: boolean;
  admissions_url?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  dueDate?: Date;
  notes?: string;
  category: 'documents' | 'essays' | 'tests' | 'recommendations' | 'financial' | 'other';
}

export interface Essay {
  id: string;
  collegeId: string;
  prompt: string;
  wordLimit: VerifiedData<number>;
  googleDriveUrl?: string;
  status: 'not_started' | 'drafting' | 'reviewing' | 'final';
  lastModified?: Date;
  notes?: string;
}

export interface Application {
  id: string;
  collegeId: string;
  status: ApplicationStatus;
  deadlineType: DeadlineType;
  targetDeadline: Date | null;
  checklist: ChecklistItem[];
  essays: Essay[];
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TimelineEvent {
  id: string;
  applicationId: string;
  collegeName: string;
  type: 'deadline' | 'milestone' | 'reminder' | 'status_change';
  title: string;
  date: Date;
  completed: boolean;
  urgent: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  country: string;
  targetCountries: string[];
  intendedMajors: string[];
  graduationYear: number;
  hasCompletedOnboarding: boolean;
  preferredLanguage: string;
  testScores?: {
    sat?: number;
    act?: number;
    ielts?: number;
    toefl?: number;
  };
  createdAt: Date;
}

// Country data for dropdowns
export interface Country {
  code: string;
  name: string;
  flag: string;
}

// UI State types
export interface DashboardStats {
  totalApplications: number;
  submitted: number;
  inProgress: number;
  upcomingDeadlines: number;
  daysToNextDeadline: number | null;
}

// Student profile collected during onboarding
export interface StudentProfile {
  name: string;
  grade: string;
  currentBoard: string;
  country: string;
  currentGPA: string;
  satScore: string;
  actScore: string;
  ibPredicted: string;
  subjects: string[];
  majorCertain: boolean | null;
  potentialMajors: string[];
  skillsStrengths: string[];
  preferredCountries: string[];
  budgetRange: string;
  campusSize: string;
  locationPreference: string;
  activities: string[];
  awards: string[];
  careerGoals: string;
  whyCollege: string;
}

// Test scores interface
export interface TestScores {
  satRange?: { percentile25: number; percentile75: number } | null;
  actRange?: { percentile25: number; percentile75: number } | null;
  averageGPA?: number;
}

// Graduation rates interface
export interface GraduationRates {
  fourYear?: number;
  sixYear?: number;
}

// Re-export CollegeOS specific types
export * from './collegeos.types';
