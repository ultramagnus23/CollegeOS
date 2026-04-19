import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { MLStudentProfile } from '../types/student';

const LS_KEY = 'collegeos_onboarding_ml';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PersistedState {
  profile: MLStudentProfile;
  currentStep: number;
  isComplete: boolean;
  savedAt: number;
}

const defaultProfile: MLStudentProfile = {
  satScore: null,
  actScore: null,
  gpaUnweighted: 0,
  gpaWeighted: 0,
  essayQuality: 3,
  extracurriculars: 1,
  leadershipPositions: 0,
  firstGen: false,
  legacy: false,
  recruitedAthlete: false,
  incomeLevel: 2,
  maxTuition: 30000,
};

interface OnboardingContextType {
  profile: MLStudentProfile;
  currentStep: number;
  isComplete: boolean;
  updateProfile: (partial: Partial<MLStudentProfile>) => void;
  nextStep: () => void;
  prevStep: () => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

function loadFromStorage(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed: PersistedState = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(LS_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export const OnboardingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const persisted = loadFromStorage();

  const [profile, setProfile] = useState<MLStudentProfile>(
    persisted.profile ?? defaultProfile,
  );
  const [currentStep, setCurrentStep] = useState<number>(persisted.currentStep ?? 0);
  const [isComplete, setIsComplete] = useState<boolean>(persisted.isComplete ?? false);

  // Auto-save to localStorage on every state change
  useEffect(() => {
    try {
      const state: PersistedState = {
        profile,
        currentStep,
        isComplete,
        savedAt: Date.now(),
      };
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      // storage quota exceeded — ignore
    }
  }, [profile, currentStep, isComplete]);

  const updateProfile = useCallback((partial: Partial<MLStudentProfile>) => {
    setProfile((prev) => ({ ...prev, ...partial }));
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((s) => s + 1);
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const completeOnboarding = useCallback(() => {
    setIsComplete(true);
  }, []);

  const resetOnboarding = useCallback(() => {
    setProfile(defaultProfile);
    setCurrentStep(0);
    setIsComplete(false);
    localStorage.removeItem(LS_KEY);
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        profile,
        currentStep,
        isComplete,
        updateProfile,
        nextStep,
        prevStep,
        completeOnboarding,
        resetOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export function useOnboarding(): OnboardingContextType {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
