export const ONBOARDING_CONTRACT = {
  requiredPayloadFields: ['name', 'currentGPA', 'preferredCountries'],
  optionalPayloadFields: ['curriculum_type', 'potentialMajors', 'activities'],
  completionEndpoint: '/api/auth/onboarding',
};
