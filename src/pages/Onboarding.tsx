import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import api from '../services/api';

/* =========================
   Constants
========================= */

const BOARDS = ['CBSE', 'ISC', 'IB', 'ICSE', 'State Board', 'Other'] as const;
const GRADES = ['11th', '12th', 'Graduate', 'Gap Year'] as const;

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science',
  'Economics', 'Business Studies', 'Accountancy', 'English', 'Hindi',
  'Psychology', 'History', 'Geography', 'Political Science'
] as const;

const COUNTRIES = ['US', 'UK', 'Canada', 'Australia', 'Germany', 'India', 'Singapore', 'Others'] as const;

const MAJORS = [
  'Computer Science', 'Engineering', 'Business/Management', 'Economics',
  'Medicine', 'Data Science', 'Artificial Intelligence', 'Biotechnology',
  'Architecture', 'Design', 'Liberal Arts', 'Physics', 'Mathematics',
  'Chemistry', 'Psychology', 'Law', 'Undecided'
] as const;

/* =========================
   Types
========================= */

type ExamStatus = 'not_planned' | 'planned' | 'registered' | 'completed';

interface ExamData {
  status?: ExamStatus;
  score?: string;
  target_date?: string;
}

type ExamsTaken = Record<string, ExamData>;

interface StudentProfile {
  academic_board: string;
  grade_level: string;
  graduation_year: number;
  subjects: string[];
  percentage: number | '';
  gpa: number | '';
  exams_taken: ExamsTaken;
  max_budget_per_year: number;
  can_take_loan: boolean;
  need_financial_aid: boolean;
  target_countries: string[];
  intended_major: string;
  career_goals: string;
  location_preference: string;
  university_size: string;
}

/* =========================
   Component
========================= */

const Onboarding: React.FC = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState<number>(1);

  const [profile, setProfile] = useState<StudentProfile>({
    academic_board: '',
    grade_level: '',
    graduation_year: new Date().getFullYear() + 1,
    subjects: [],
    percentage: '',
    gpa: '',
    exams_taken: {},
    max_budget_per_year: 0,
    can_take_loan: false,
    need_financial_aid: false,
    target_countries: [],
    intended_major: '',
    career_goals: '',
    location_preference: 'no_preference',
    university_size: 'no_preference'
  });

  const totalSteps = 5;

  /* =========================
     State Helpers
  ========================= */

  const updateProfile = <K extends keyof StudentProfile>(
    field: K,
    value: StudentProfile[K]
  ): void => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const toggleArrayItem = (
    field: 'subjects' | 'target_countries',
    item: string
  ): void => {
    setProfile(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item]
    }));
  };

  const updateExam = (
    examName: string,
    field: keyof ExamData,
    value: string
  ): void => {
    setProfile(prev => ({
      ...prev,
      exams_taken: {
        ...prev.exams_taken,
        [examName]: {
          ...(prev.exams_taken[examName] || {}),
          [field]: value
        }
      }
    }));
  };

  const handleNext = (): void => {
    if (step < totalSteps) setStep(s => s + 1);
  };

  const handleBack = (): void => {
    if (step > 1) setStep(s => s - 1);
  };

  const handleSubmit = async (): Promise<void> => {
    try {
      await api.profile.updateAcademic(profile as unknown as Record<string, unknown>);
      await api.recommendations.generate();
      navigate('/discover');
    } catch (error) {
      alert('Failed to save profile. Please try again.');
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Welcome to CollegeOS</h1>
          <p className="text-lg text-gray-600">
            Let's understand your profile so we can find the perfect colleges for you
          </p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {[1, 2, 3, 4, 5].map(s => (
              <div key={s} className={`flex items-center ${s < totalSteps ? 'flex-1' : ''}`}>
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                    s < step
                      ? 'bg-green-500 text-white'
                      : s === step
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}
                >
                  {s < step ? <CheckCircle className="w-6 h-6" /> : s}
                </div>
                {s < totalSteps && (
                  <div className={`h-1 flex-1 mx-2 ${s < step ? 'bg-green-500' : 'bg-gray-300'}`} />
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-600">
            Step {step} of {totalSteps}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-2 px-6 py-3 border rounded-lg disabled:opacity-50"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          {step < totalSteps ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg"
            >
              Next
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white rounded-lg font-semibold"
            >
              <CheckCircle className="w-5 h-5" />
              Complete Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* =========================
   Helper Components
========================= */

interface FormGroupProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}

const FormGroup: React.FC<FormGroupProps> = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium mb-2">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
  </div>
);

interface ExamInputProps {
  examName: string;
  examData: ExamData;
  onUpdate: (field: keyof ExamData, value: string) => void;
}

const ExamInput: React.FC<ExamInputProps> = ({ examName, examData, onUpdate }) => (
  <div className="p-4 border rounded-lg">
    <h3 className="font-semibold mb-3">{examName}</h3>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <select
        value={examData.status ?? 'not_planned'}
        onChange={e => onUpdate('status', e.target.value)}
        className="px-3 py-2 border rounded-lg"
      >
        <option value="not_planned">Not Planned</option>
        <option value="planned">Planned</option>
        <option value="registered">Registered</option>
        <option value="completed">Completed</option>
      </select>

      {examData.status === 'completed' && (
        <input
          type="text"
          value={examData.score ?? ''}
          onChange={e => onUpdate('score', e.target.value)}
          className="px-3 py-2 border rounded-lg"
          placeholder="Score"
        />
      )}

      {(examData.status === 'planned' || examData.status === 'registered') && (
        <input
          type="date"
          value={examData.target_date ?? ''}
          onChange={e => onUpdate('target_date', e.target.value)}
          className="px-3 py-2 border rounded-lg"
        />
      )}
    </div>
  </div>
);

export default Onboarding;
