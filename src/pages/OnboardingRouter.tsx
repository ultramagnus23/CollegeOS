/**
 * OnboardingRouter.tsx — flag-gated entry to onboarding.
 *
 * When MASTERS_TRACK_ENABLED is OFF, this renders the existing undergrad
 * OnboardingPage unchanged (byte-identical behavior — zero risk to the validated
 * flow). When ON, it shows the Phase 3 root branch first and routes accordingly.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OnboardingPage from './Onboarding';
import ApplicationTypeStep from '../components/onboarding/ApplicationTypeStep';
import { isMastersTrackEnabled } from '../config/featureFlags';
import { api } from '../services/api';
import { StudentProfile } from '../types/index';

interface Props {
  onComplete: (profile: StudentProfile) => void | Promise<void>;
}

const OnboardingRouter: React.FC<Props> = ({ onComplete }) => {
  const navigate = useNavigate();
  const [path, setPath] = useState<'choose' | 'undergrad'>(
    isMastersTrackEnabled() ? 'choose' : 'undergrad',
  );

  // Flag off, or user chose the undergrad path → existing flow, untouched.
  if (path === 'undergrad') {
    return <OnboardingPage onComplete={onComplete} />;
  }

  return (
    <ApplicationTypeStep
      onUndergrad={() => setPath('undergrad')}
      onMasters={async (enrollment, year) => {
        try {
          await api.masters.setTrack({ programTrack: 'masters', enrollmentStatus: enrollment, yearOfStudy: year ?? undefined });
        } catch {
          /* non-fatal; the masters onboarding will set the track again on save */
        }
        navigate('/masters/onboarding');
      }}
    />
  );
};

export default OnboardingRouter;
