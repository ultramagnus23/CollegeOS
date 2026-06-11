export interface OnboardingContractPayload {
  name: string;
  currentGPA: number;
  preferredCountries: string[];
  curriculum_type?: string;
  potentialMajors?: string[];
  activities?: unknown[];
}

export const ONBOARDING_CONTRACT = {
  requiredPayloadFields: ['name', 'currentGPA', 'preferredCountries'] as const,
  optionalPayloadFields: ['curriculum_type', 'potentialMajors', 'activities'] as const,
  completionEndpoint: '/api/auth/onboarding',
} as const;
