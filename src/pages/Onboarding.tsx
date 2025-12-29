// Simple onboarding page - implement later
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { completeOnboarding } = useAuth();

  const handleComplete = async () => {
    await completeOnboarding({
      targetCountries: ['USA'],
      intendedMajors: ['Computer Science'],
      testStatus: {},
      languagePreferences: ['English']
    });
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <button onClick={handleComplete} className="bg-blue-600 text-white px-6 py-3 rounded">
        Complete Onboarding
      </button>
    </div>
  );
}