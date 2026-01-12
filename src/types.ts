// FILE: src/types.ts
export interface StudentProfile {
  name: string;
  grade: string;
  currentBoard: string;
  country: string;
  currentGPA: string;
  satScore: string;
  actScore: string;
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