// Core application types with trust-first philosophy

export type TrustTier = 'official' | 'secondary' | 'forum' | 'unverified';

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

export interface College {
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

// Re-export CollegeOS specific types
export * from './collegeos.types';
