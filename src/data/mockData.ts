import { College, Application, TimelineEvent, UserProfile, Country, DashboardStats } from '@/types';

// Sample countries
export const countries: Country[] = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
];

// Sample colleges with verified/unverified data
export const sampleColleges: College[] = [
  {
    id: '1',
    name: 'Massachusetts Institute of Technology',
    country: 'United States',
    countryCode: 'US',
    city: 'Cambridge, MA',
    officialWebsite: 'https://www.mit.edu',
    admissionsUrl: 'https://admissions.mit.edu',
    logoUrl: undefined,
    deadlines: [
      {
        id: 'd1',
        type: 'early_action',
        date: new Date('2025-11-01'),
        source: { url: 'https://admissions.mit.edu/apply', tier: 'official', accessedAt: new Date(), label: 'MIT Admissions' },
      },
      {
        id: 'd2',
        type: 'regular',
        date: new Date('2026-01-01'),
        source: { url: 'https://admissions.mit.edu/apply', tier: 'official', accessedAt: new Date(), label: 'MIT Admissions' },
      },
    ],
    requirements: {
      value: ['Common App or MyMIT', 'Essays', '2 Teacher Recommendations', 'Counselor Report', 'SAT/ACT (Optional)'],
      source: { url: 'https://admissions.mit.edu/apply', tier: 'official', accessedAt: new Date() },
      lastVerified: new Date(),
    },
    testPolicy: {
      value: 'Test Optional for 2024-2025 cycle',
      source: { url: 'https://admissions.mit.edu/apply/first-year/testing', tier: 'official', accessedAt: new Date() },
      lastVerified: new Date(),
    },
    applicationFee: {
      value: '$75',
      source: { url: 'https://admissions.mit.edu/apply', tier: 'official', accessedAt: new Date() },
      lastVerified: new Date(),
    },
    acceptanceRate: {
      value: null, // Intentionally null to show "Data not available"
      source: null,
      lastVerified: null,
    },
    hasPortfolioRequirement: true,
    hasInterviewRequirement: true,
    hasLanguageRequirement: false,
    requiresFinancialDocs: true,
    lastUpdated: new Date(),
  },
  {
    id: '2',
    name: 'University of Oxford',
    country: 'United Kingdom',
    countryCode: 'GB',
    city: 'Oxford',
    officialWebsite: 'https://www.ox.ac.uk',
    admissionsUrl: 'https://www.ox.ac.uk/admissions',
    logoUrl: undefined,
    deadlines: [
      {
        id: 'd3',
        type: 'regular',
        date: new Date('2025-10-15'),
        source: { url: 'https://www.ox.ac.uk/admissions/undergraduate/applying-to-oxford', tier: 'official', accessedAt: new Date() },
      },
    ],
    requirements: {
      value: ['UCAS Application', 'Personal Statement', 'Academic Reference', 'Admissions Test (subject-specific)'],
      source: { url: 'https://www.ox.ac.uk/admissions/undergraduate', tier: 'official', accessedAt: new Date() },
      lastVerified: new Date(),
    },
    testPolicy: {
      value: 'Admissions tests required for most subjects',
      source: { url: 'https://www.ox.ac.uk/admissions/undergraduate/applying-to-oxford/tests', tier: 'official', accessedAt: new Date() },
      lastVerified: new Date(),
    },
    applicationFee: {
      value: '£27 (single choice) or £29.50 (multiple)',
      source: { url: 'https://www.ucas.com/undergraduate/applying-to-university', tier: 'secondary', accessedAt: new Date(), label: 'UCAS' },
      lastVerified: new Date(),
    },
    acceptanceRate: {
      value: 17.5,
      source: { url: 'https://www.ox.ac.uk/about/facts-and-figures', tier: 'official', accessedAt: new Date() },
      lastVerified: new Date(),
    },
    hasPortfolioRequirement: false,
    hasInterviewRequirement: true,
    hasLanguageRequirement: true,
    requiresFinancialDocs: false,
    lastUpdated: new Date(),
  },
  {
    id: '3',
    name: 'ETH Zürich',
    country: 'Switzerland',
    countryCode: 'CH',
    city: 'Zürich',
    officialWebsite: 'https://ethz.ch',
    admissionsUrl: 'https://ethz.ch/en/studies/bachelor/application.html',
    logoUrl: undefined,
    deadlines: [
      {
        id: 'd4',
        type: 'regular',
        date: new Date('2026-04-30'),
        source: { url: 'https://ethz.ch/en/studies/bachelor/application.html', tier: 'official', accessedAt: new Date() },
      },
    ],
    requirements: {
      value: null, // Show as "Data not available - check official website"
      source: null,
      lastVerified: null,
    },
    testPolicy: {
      value: 'Entrance examination required for international students',
      source: { url: 'https://ethz.ch/en/studies/bachelor/application/entrance-examination.html', tier: 'official', accessedAt: new Date() },
      lastVerified: new Date(),
    },
    applicationFee: {
      value: 'CHF 150',
      source: { url: 'https://ethz.ch/en/studies/bachelor/application.html', tier: 'official', accessedAt: new Date() },
      lastVerified: new Date(),
    },
    acceptanceRate: {
      value: null,
      source: null,
      lastVerified: null,
    },
    hasPortfolioRequirement: false,
    hasInterviewRequirement: false,
    hasLanguageRequirement: true,
    requiresFinancialDocs: false,
    lastUpdated: new Date(),
  },
];

// Sample applications
export const sampleApplications: Application[] = [
  {
    id: 'app1',
    collegeId: '1',
    status: 'in_progress',
    deadlineType: 'early_action',
    targetDeadline: new Date('2025-11-01'),
    checklist: [
      { id: 'c1', label: 'Complete Common App profile', completed: true, category: 'documents' },
      { id: 'c2', label: 'Request teacher recommendations', completed: true, category: 'recommendations' },
      { id: 'c3', label: 'Write MIT essays', completed: false, category: 'essays', dueDate: new Date('2025-10-20') },
      { id: 'c4', label: 'Submit CSS Profile', completed: false, category: 'financial' },
      { id: 'c5', label: 'Prepare maker portfolio', completed: false, category: 'documents' },
    ],
    essays: [
      {
        id: 'e1',
        collegeId: '1',
        prompt: 'Describe the world you come from',
        wordLimit: { value: 250, source: null, lastVerified: null },
        status: 'drafting',
        googleDriveUrl: undefined,
      },
    ],
    notes: 'Focus on robotics project for activities section',
    createdAt: new Date('2025-09-01'),
    updatedAt: new Date(),
  },
  {
    id: 'app2',
    collegeId: '2',
    status: 'researching',
    deadlineType: 'regular',
    targetDeadline: new Date('2025-10-15'),
    checklist: [
      { id: 'c6', label: 'Create UCAS account', completed: true, category: 'documents' },
      { id: 'c7', label: 'Write personal statement', completed: false, category: 'essays' },
      { id: 'c8', label: 'Register for admissions test', completed: false, category: 'tests' },
    ],
    essays: [],
    notes: 'Check specific subject requirements',
    createdAt: new Date('2025-09-15'),
    updatedAt: new Date(),
  },
];

// Sample timeline events
export const sampleTimelineEvents: TimelineEvent[] = [
  {
    id: 't1',
    applicationId: 'app2',
    collegeName: 'University of Oxford',
    type: 'deadline',
    title: 'UCAS Application Due',
    date: new Date('2025-10-15'),
    completed: false,
    urgent: true,
  },
  {
    id: 't2',
    applicationId: 'app1',
    collegeName: 'MIT',
    type: 'deadline',
    title: 'Early Action Deadline',
    date: new Date('2025-11-01'),
    completed: false,
    urgent: false,
  },
  {
    id: 't3',
    applicationId: 'app1',
    collegeName: 'MIT',
    type: 'reminder',
    title: 'Start CSS Profile',
    date: new Date('2025-10-10'),
    completed: false,
    urgent: false,
  },
  {
    id: 't4',
    applicationId: 'app1',
    collegeName: 'MIT',
    type: 'milestone',
    title: 'Teacher recommendations requested',
    date: new Date('2025-09-20'),
    completed: true,
    urgent: false,
  },
];

// Sample user profile
export const sampleUserProfile: UserProfile = {
  id: 'user1',
  email: 'student@example.com',
  name: 'Alex Chen',
  country: 'US',
  targetCountries: ['US', 'GB', 'CH'],
  intendedMajors: ['Computer Science', 'Electrical Engineering'],
  graduationYear: 2026,
  hasCompletedOnboarding: true,
  preferredLanguage: 'en',
  testScores: {
    sat: 1520,
    toefl: 115,
  },
  createdAt: new Date('2025-08-01'),
};

// Dashboard stats calculator
export function calculateDashboardStats(applications: Application[]): DashboardStats {
  const now = new Date();
  const submitted = applications.filter(a => a.status === 'submitted' || a.status === 'decision_pending').length;
  const inProgress = applications.filter(a => ['researching', 'planning', 'in_progress'].includes(a.status)).length;
  
  const upcomingDeadlines = applications.filter(a => {
    if (!a.targetDeadline) return false;
    const daysUntil = Math.ceil((a.targetDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil > 0 && daysUntil <= 30;
  }).length;

  const nextDeadline = applications
    .filter(a => a.targetDeadline && a.targetDeadline > now)
    .sort((a, b) => a.targetDeadline!.getTime() - b.targetDeadline!.getTime())[0];

  const daysToNextDeadline = nextDeadline?.targetDeadline 
    ? Math.ceil((nextDeadline.targetDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    totalApplications: applications.length,
    submitted,
    inProgress,
    upcomingDeadlines,
    daysToNextDeadline,
  };
}
