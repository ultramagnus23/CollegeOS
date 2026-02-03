/**
 * CollegeOS Frontend Types
 * Core TypeScript interfaces for the CollegeOS application
 */

// ==========================================
// FIT CLASSIFICATION TYPES
// ==========================================

export type FitCategory = 'safety' | 'target' | 'reach' | 'unrealistic';

export interface FitFactor {
  name: string;
  score: number;
  weight: number;
  detail: string;
  impact: 'positive' | 'neutral' | 'negative';
  category?: string;
}

export interface FitScore {
  score: number;
  category: FitCategory;
  factors: FitFactor[];
}

export interface CalculationStep {
  step: number;
  description: string;
  value: number;
}

export interface FitExplanation {
  summary: string;
  factors: FitFactor[];
  calculationSteps: CalculationStep[];
  recommendations: string[];
  lastUpdated: Date;
  confidence: number;
}

export interface CollegeFit {
  fitCategory: FitCategory;
  overallScore: number;
  confidence: number;
  academicFit: FitScore;
  profileFit: FitScore;
  financialFit: FitScore;
  timelineFit: FitScore;
  explanation: FitExplanation;
  fromCache?: boolean;
}

export interface FitWeights {
  academic: number;
  profile: number;
  financial: number;
  timeline: number;
}

// ==========================================
// TASK TYPES
// ==========================================

export type TaskType = 'essay' | 'test' | 'transcript' | 'recommendation' | 'portfolio' | 'form' | 'interview' | 'other';
export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'complete' | 'skipped';

export interface Task {
  id: number;
  userId: number;
  collegeId: number | null;
  applicationId: number | null;
  taskType: TaskType;
  title: string;
  description?: string;
  status: TaskStatus;
  blockingReason?: string;
  blockedByTaskId?: number;
  deadline?: Date;
  estimatedHours: number;
  actualHours?: number;
  priority: 1 | 2 | 3 | 4;
  progressPercent: number;
  isReusable: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  collegeName?: string;
}

export interface TaskWithDependencies extends Task {
  dependsOn: number[];
  blockedBy: number[];
  blocks: number[];
}

export interface DependencyGraph {
  tasks: Record<number, Task>;
  graph: Record<number, TaskWithDependencies>;
  totalTasks: number;
  completedTasks: number;
  blockedTasks: number;
}

export interface TaskCompletion {
  tasks: Task[];
  completion: number;
  totalTasks: number;
  completedTasks: number;
  blockedTasks: number;
}

export interface CriticalTask extends Task {
  bufferHours: number;
  isCritical: boolean;
  urgencyLevel: 'safe' | 'tight' | 'critical' | 'impossible';
}

// ==========================================
// DEADLINE & RISK TYPES
// ==========================================

export type RiskLevel = 'safe' | 'tight' | 'critical' | 'impossible';
export type DeadlineType = 'official' | 'internal' | 'buffer' | 'personal' | 'early_decision' | 'early_action' | 'regular' | 'priority' | 'financial_aid';

export interface RiskAssessment {
  level: RiskLevel;
  bufferHours: number;
  hoursRemaining: number;
  hoursNeeded: number;
  description: string;
  tasksCount: number;
}

export interface UserDeadline {
  id: number;
  userId: number;
  collegeId: number | null;
  applicationId: number | null;
  title: string;
  deadlineType: DeadlineType;
  deadlineDate: Date;
  riskLevel: RiskLevel;
  bufferHours: number;
  tasksRemaining: number;
  hoursNeeded: number;
  isCompleted: boolean;
  isActive: boolean;
  alertSent: boolean;
  notes?: string;
  collegeName?: string;
  daysUntil?: number;
  risk?: RiskAssessment;
}

export interface DeadlineAlert {
  id: number;
  userId: number;
  deadlineId: number;
  alertType: 'warning' | 'critical' | 'impossible' | 'reminder';
  alertMessage: string;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: Date;
  readAt?: Date;
  deadlineTitle?: string;
  deadlineDate?: Date;
  collegeName?: string;
}

export interface ImpossibleCollege {
  collegeId: number;
  collegeName: string;
  deadline: Date;
  deadlineType: DeadlineType;
  risk: RiskAssessment;
  suggestions: string[];
}

export interface RiskOverview {
  summary: {
    totalDeadlines: number;
    safe: number;
    tight: number;
    critical: number;
    impossible: number;
  };
  criticalDeadlines: UserDeadline[];
  impossibleColleges: ImpossibleCollege[];
  unreadAlerts: number;
  alerts: DeadlineAlert[];
}

// ==========================================
// COLLEGE INTELLIGENCE TYPES
// ==========================================

export type ApplicationSystemType = 'CommonApp' | 'UCAS' | 'UniAssist' | 'Coalition' | 'Direct' | 'JEE' | 'NEET' | 'CUET';

export interface CollegeAlias {
  id: number;
  collegeId: number;
  alias: string;
  aliasType: 'abbreviation' | 'former_name' | 'common_name' | 'typo';
}

export interface ApplicationSystem {
  id: number;
  collegeId: number;
  systemType: ApplicationSystemType;
  systemUrl?: string;
  systemNotes?: string;
}

export interface IntakeCycle {
  id: number;
  collegeId: number;
  cycleName: 'Fall' | 'Spring' | 'Winter' | 'Summer' | 'Rolling';
  startMonth: number;
  endMonth: number;
  isPrimary: boolean;
  acceptsInternational: boolean;
  notes?: string;
}

export interface RequiredExam {
  id: number;
  collegeId: number;
  examName: string;
  examCategory: 'standardized' | 'language' | 'subject' | 'entrance';
  isRequired: boolean;
  isOptional: boolean;
  isTestBlind: boolean;
  minimumScore?: string;
  recommendedScore?: string;
  validMonths: number;
  notes?: string;
}

// ==========================================
// PROFILE TYPES
// ==========================================

export interface ProfileSnapshot {
  id: number;
  userId: number;
  snapshotData: string;
  gpaAtSnapshot?: number;
  testScoresAtSnapshot?: string;
  activitiesCount?: number;
  awardsCount?: number;
  triggerEvent: 'manual' | 'gpa_update' | 'test_score' | 'scheduled';
  notes?: string;
  createdAt: Date;
}

// ==========================================
// DATA QUALITY TYPES
// ==========================================

export type DataSourceType = 'official_api' | 'verified_scrape' | 'user_submitted' | 'community';
export type WarningLevel = 'none' | 'yellow' | 'red';

export interface DataQuality {
  id: number;
  entityType: string;
  entityId: number;
  fieldName?: string;
  sourceType: DataSourceType;
  sourceUrl?: string;
  sourceLabel?: string;
  confidenceScore: number;
  warningLevel: WarningLevel;
  lastVerified?: Date;
  expiresAt?: Date;
}

// ==========================================
// COMMAND CENTER TYPES
// ==========================================

export interface TodayPriority {
  id: number;
  type: 'deadline' | 'task' | 'alert';
  title: string;
  collegeName?: string;
  dueDate?: Date;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  action: string;
}

export interface Bottleneck {
  type: 'task' | 'deadline' | 'requirement';
  description: string;
  affectedColleges: string[];
  suggestion: string;
}

export interface CountryProgress {
  country: string;
  totalColleges: number;
  submitted: number;
  inProgress: number;
  notStarted: number;
  completionPercent: number;
}

export interface CommandCenterData {
  todayPriorities: TodayPriority[];
  bottlenecks: Bottleneck[];
  atRiskColleges: ImpossibleCollege[];
  progressByCountry: CountryProgress[];
  overallReadiness: number;
}

// ==========================================
// SIMULATION TYPES
// ==========================================

export interface SimulationInput {
  field: 'gpa' | 'satScore' | 'actScore' | 'addCollege' | 'dropCollege' | 'missDeadline';
  originalValue: any;
  simulatedValue: any;
}

export interface SimulationResult {
  input: SimulationInput;
  originalFits: Record<number, CollegeFit>;
  simulatedFits: Record<number, CollegeFit>;
  changes: {
    collegeId: number;
    collegeName: string;
    originalCategory: FitCategory;
    newCategory: FitCategory;
    scoreDelta: number;
  }[];
  summary: string;
}

// ==========================================
// API RESPONSE TYPES
// ==========================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  count?: number;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}
