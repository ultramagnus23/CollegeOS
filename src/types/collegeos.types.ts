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
// CDS CHANCING TYPES
// ==========================================

export interface CDSTestScores {
  sat_25th: number;
  sat_75th: number;
  act_25th: number;
  act_75th: number;
  sat_reading_25th?: number;
  sat_reading_75th?: number;
  sat_math_25th?: number;
  sat_math_75th?: number;
}

export interface CDSGPAData {
  average_gpa: number;
  percent_3_75_above: number;
  percent_3_50_to_3_74: number;
  percent_3_25_to_3_49: number;
  percent_3_00_to_3_24: number;
}

export type CDSFactorImportance = 'very_important' | 'important' | 'considered' | 'not_considered';

export interface CDSAcademicFactors {
  rigor_of_secondary_school: CDSFactorImportance;
  class_rank: CDSFactorImportance;
  academic_gpa: CDSFactorImportance;
  standardized_test_scores: CDSFactorImportance;
  application_essay: CDSFactorImportance;
  recommendation: CDSFactorImportance;
}

export interface CDSNonacademicFactors {
  interview: CDSFactorImportance;
  extracurricular_activities: CDSFactorImportance;
  talent_ability: CDSFactorImportance;
  character_qualities: CDSFactorImportance;
  first_generation: CDSFactorImportance;
  alumni_relation: CDSFactorImportance;
  geographical_residence: CDSFactorImportance;
  state_residency: CDSFactorImportance;
  religious_affiliation: CDSFactorImportance;
  racial_ethnic_status: CDSFactorImportance;
  volunteer_work: CDSFactorImportance;
  work_experience: CDSFactorImportance;
  level_of_interest: CDSFactorImportance;
}

export interface CDSCollegeData {
  college_name: string;
  year: string;
  acceptance_rate: number;
  test_scores: CDSTestScores;
  gpa_data: CDSGPAData;
  class_rank: {
    percent_top_10: number;
    percent_top_25: number;
    percent_top_50: number;
  };
  academic_factors: CDSAcademicFactors;
  nonacademic_factors: CDSNonacademicFactors;
  weights: {
    academic: number;
    extracurricular: number;
    essays: number;
    recommendations: number;
    demographics: number;
  };
}

export interface CDSChancingFactor {
  name: string;
  importance: CDSFactorImportance;
  score: number;
  weight: number;
  impact: 'positive' | 'neutral' | 'negative';
  details: string;
  improvementPotential?: number | string;
}

export interface CDSImprovementSuggestion {
  area: string;
  currentValue?: number;
  targetValue?: number;
  impact: string;
  pointsNeeded?: number;
}

export interface CDSComparisonToAdmitted {
  sat?: {
    student: number;
    p25: number;
    p75: number;
    percentile: number;
  };
  act?: {
    student: number;
    p25: number;
    p75: number;
    percentile: number;
  };
  gpa?: {
    student: number;
    average: number;
    percentile: number;
  };
}

export interface CDSChancingResult {
  percentage: number;
  category: 'safety' | 'target' | 'reach';
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  factors: CDSChancingFactor[];
  cdsBasedCalculation: boolean;
  cdsYear: string;
  collegeAcceptanceRate: string;
  comparisonToAdmitted: CDSComparisonToAdmitted;
  improvements: CDSImprovementSuggestion[];
  strengthAreas: string[];
  improvementAreas: string[];
}

// ==========================================
// WARNING SYSTEM TYPES
// ==========================================

export type UrgencyLevel = 'safe' | 'approaching' | 'warning' | 'critical' | 'overdue';
export type UrgencyColor = 'green' | 'yellow' | 'orange' | 'red' | 'darkred';

export interface WarningUrgency {
  level: UrgencyLevel;
  color: UrgencyColor;
  priority: number;
}

export interface DeadlineWarning {
  id: number;
  type: 'deadline' | 'task';
  title: string;
  collegeName?: string;
  collegeId?: number;
  date: string;
  daysUntil: number;
  urgency: WarningUrgency;
  urgencyLabel: string;
  message: string;
}

export interface TaskWarning {
  id: number;
  type: 'task';
  title: string;
  taskType: string;
  collegeName?: string;
  collegeId?: number;
  deadline: string;
  daysUntil: number;
  estimatedHours: number;
  priority: number;
  isBlocked: boolean;
  blockingReason?: string;
  isAtRisk: boolean;
  urgency: WarningUrgency;
  urgencyLabel: string;
}

export interface WarningRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: string;
  items: string[];
}

export interface WarningsData {
  critical: DeadlineWarning[];
  warning: DeadlineWarning[];
  approaching: DeadlineWarning[];
  safe: DeadlineWarning[];
  overdue: DeadlineWarning[];
  summary: {
    total: number;
    criticalCount: number;
    warningCount: number;
    overdueCount: number;
  };
  taskWarnings: TaskWarning[];
  recommendations: WarningRecommendation[];
}

export interface TaskLoadDayDistribution {
  date: string;
  taskCount: number;
  hoursNeeded: number;
  tasks: { id: number; title: string; hours: number }[];
}

export interface TaskLoadData {
  totalTasks: number;
  totalHoursNeeded: number;
  availableHours: number;
  utilization: number;
  isOverloaded: boolean;
  loadLevel: 'light' | 'moderate' | 'heavy' | 'overloaded';
  byPriority: {
    critical: any[];
    high: any[];
    medium: any[];
    low: any[];
  };
  dailyDistribution: TaskLoadDayDistribution[];
  suggestedSchedule: {
    date: string;
    tasks: { id: number; title: string; allocatedHours: number; priority: number; partial?: boolean }[];
    hoursAllocated: number;
  }[];
}

export interface DashboardWarningSummary {
  urgentItems: number;
  warningItems: number;
  approachingItems: number;
  totalActiveDeadlines: number;
  weeklyTaskLoad: string;
  weeklyUtilization: number;
  topPriorities: DeadlineWarning[];
  recommendations: WarningRecommendation[];
}

// ==========================================
// DEPENDENCY GRAPH TYPES
// ==========================================

export interface DependencyGraphNode {
  id: number;
  label: string;
  status: string;
  deadline?: string;
  collegeId?: number;
  collegeName?: string;
  isBlocked: boolean;
  dependencyCount: number;
  blocksCount: number;
}

export interface DependencyGraphEdge {
  from: number;
  to: number;
  type: 'blocks' | 'soft_depends' | 'should_complete_first';
}

export interface DependencyGraph {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
  levels: Record<number, number>;
  criticalPath: number[];
}

export interface RecommendedTaskOrder {
  order: number;
  taskId: number;
  title: string;
  status: string;
  deadline?: string;
  blocksCount: number;
  reason: string;
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
