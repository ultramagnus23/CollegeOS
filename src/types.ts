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
