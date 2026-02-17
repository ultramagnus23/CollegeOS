// FILE: src/types.ts
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

// Shared College interface used across multiple pages
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
