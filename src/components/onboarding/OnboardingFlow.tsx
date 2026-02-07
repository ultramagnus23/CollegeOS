/**
 * Onboarding Flow Component
 * Parent component that manages the complete onboarding process with curriculum branching
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, GraduationCap, BookOpen, Target, Trophy, FileText, Heart, Sparkles, Save, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import IBOnboarding from './IBOnboarding';
import ALevelOnboarding from './ALevelOnboarding';
import CBSEOnboarding from './CBSEOnboarding';

// Curriculum types
const CURRICULUM_TYPES = [
  { value: 'IB', label: 'International Baccalaureate (IB)', icon: '🌍', desc: 'IB Diploma Programme' },
  { value: 'A-Level', label: 'A-Levels', icon: '🇬🇧', desc: 'Cambridge, Edexcel, AQA, OCR' },
  { value: 'CBSE', label: 'CBSE', icon: '🇮🇳', desc: 'Central Board of Secondary Education' },
  { value: 'ICSE', label: 'ICSE/ISC', icon: '🇮🇳', desc: 'Indian Certificate of Secondary Education' },
  { value: 'US', label: 'US High School', icon: '🇺🇸', desc: 'AP, Honors, Regular courses' },
  { value: 'Other', label: 'Other', icon: '📚', desc: 'State Board, Other international' }
];

// Countries list
const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia',
  'Singapore', 'UAE', 'Germany', 'France', 'Netherlands', 'Other'
];

// Majors list
const MAJORS = [
  'Computer Science', 'Engineering', 'Business/Management', 'Medicine',
  'Psychology', 'Economics', 'Data Science', 'Biology', 'Mathematics',
  'Physics', 'Chemistry', 'Arts/Design', 'Political Science', 'Law',
  'Architecture', 'Environmental Science', 'Communications', 'Undecided'
];

// Budget options
const BUDGET_OPTIONS = [
  { value: 'under_20k', label: 'Under $20,000/year', min: 0, max: 20000 },
  { value: '20k_40k', label: '$20,000 - $40,000/year', min: 20000, max: 40000 },
  { value: '40k_60k', label: '$40,000 - $60,000/year', min: 40000, max: 60000 },
  { value: 'over_60k', label: '$60,000+/year', min: 60000, max: 100000 },
  { value: 'need_aid', label: 'Need Full Financial Aid', min: 0, max: 0 }
];

interface OnboardingFlowProps {
  onComplete?: () => void;
}

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  
  // Form data
  const [formData, setFormData] = useState({
    // Step 1: Basic Info
    first_name: '',
    last_name: '',
    email: '',
    country: '',
    
    // Step 2: Curriculum Selection
    curriculum_type: '',
    
    // Step 3: Curriculum-specific data (populated by child components)
    curriculumData: null as any,
    
    // Step 4: Test Scores
    sat_total: null as number | null,
    sat_math: null as number | null,
    sat_ebrw: null as number | null,
    act_composite: null as number | null,
    ielts_score: null as number | null,
    toefl_score: null as number | null,
    skip_tests: false,
    
    // Step 5: Activities (optional)
    activities: [] as any[],
    skip_activities: false,
    
    // Step 6: Preferences
    intended_majors: [] as string[],
    preferred_countries: [] as string[],
    budget_range: '',
    budget_min: null as number | null,
    budget_max: null as number | null,
    college_size_preference: '',
    campus_setting_preference: ''
  });
  
  const [errors, setErrors] = useState<string[]>([]);

  // Load draft on mount
  useEffect(() => {
    loadDraft();
  }, [user]);

  const loadDraft = async () => {
    if (!user?.id) return;
    
    try {
      const response = await api.getOnboardingDraft(user.id);
      if (response.data?.draft) {
        setFormData(prev => ({ ...prev, ...response.data.draft }));
        setCurrentStep(response.data.step || 1);
      }
    } catch (error) {
      console.log('No draft to load');
    }
  };

  const saveDraft = async () => {
    if (!user?.id) return;
    
    setSaving(true);
    try {
      await api.saveOnboardingDraft(user.id, {
        draft: formData,
        step: currentStep
      });
      setSaveMessage('Draft saved!');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
    setSaving(false);
  };

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleArrayValue = (field: string, value: string) => {
    setFormData(prev => {
      const arr = prev[field as keyof typeof prev] as string[];
      if (arr.includes(value)) {
        return { ...prev, [field]: arr.filter(v => v !== value) };
      } else {
        return { ...prev, [field]: [...arr, value] };
      }
    });
  };

  // Validation functions
  const validateStep1 = () => {
    const newErrors: string[] = [];
    if (!formData.first_name) newErrors.push('First name is required');
    if (!formData.email) newErrors.push('Email is required');
    if (!formData.country) newErrors.push('Country is required');
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const validateStep2 = () => {
    if (!formData.curriculum_type) {
      setErrors(['Please select your curriculum type']);
      return false;
    }
    setErrors([]);
    return true;
  };

  const validateStep6 = () => {
    if (formData.intended_majors.length === 0) {
      setErrors(['Please select at least one intended major']);
      return false;
    }
    setErrors([]);
    return true;
  };

  // Handle curriculum-specific completion
  const handleCurriculumComplete = (data: any) => {
    setFormData(prev => ({
      ...prev,
      curriculumData: data
    }));
    nextStep();
  };

  // Navigation
  const nextStep = () => {
    setErrors([]);
    
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;
    if (currentStep === 6 && !validateStep6()) return;
    
    // Skip curriculum step if not IB, A-Level, or CBSE
    if (currentStep === 2) {
      const skipCurriculumStep = !['IB', 'A-Level', 'CBSE'].includes(formData.curriculum_type);
      if (skipCurriculumStep) {
        setCurrentStep(4); // Skip to test scores
        return;
      }
    }
    
    setCurrentStep(prev => Math.min(prev + 1, 7));
    saveDraft();
  };

  const prevStep = () => {
    setErrors([]);
    
    // Handle skipping curriculum step going backward
    if (currentStep === 4 && !['IB', 'A-Level', 'CBSE'].includes(formData.curriculum_type)) {
      setCurrentStep(2);
      return;
    }
    
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // Submit final data
  const handleSubmit = async () => {
    setSaving(true);
    try {
      // Combine all form data
      const profileData = {
        // Basic info
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        country: formData.country,
        
        // Academic
        curriculum_type: formData.curriculum_type,
        ...formData.curriculumData,
        
        // Test scores
        sat_total: formData.sat_total,
        sat_math: formData.sat_math,
        sat_ebrw: formData.sat_ebrw,
        act_composite: formData.act_composite,
        ielts_score: formData.ielts_score,
        toefl_score: formData.toefl_score,
        
        // Preferences
        intended_majors: formData.intended_majors,
        preferred_countries: formData.preferred_countries,
        budget_min: formData.budget_min,
        budget_max: formData.budget_max,
        preferred_college_size: formData.college_size_preference,
        preferred_setting: formData.campus_setting_preference
      };

      if (user?.id) {
        // Update basic info
        await api.updateBasicInfo(user.id, {
          first_name: profileData.first_name,
          last_name: profileData.last_name,
          email: profileData.email,
          country: profileData.country
        });

        // Update academic info
        await api.updateAcademicInfo(user.id, {
          curriculum_type: profileData.curriculum_type,
          ...(formData.curriculumData || {})
        });

        // Update subjects if available
        if (formData.curriculumData?.subjects?.length > 0) {
          await api.updateSubjects(user.id, {
            curriculum_type: formData.curriculum_type,
            subjects: formData.curriculumData.subjects
          });
        }

        // Update test scores
        if (!formData.skip_tests) {
          await api.updateTestScores(user.id, {
            sat_total: profileData.sat_total,
            sat_math: profileData.sat_math,
            sat_ebrw: profileData.sat_ebrw,
            act_composite: profileData.act_composite,
            ielts_score: profileData.ielts_score,
            toefl_score: profileData.toefl_score
          });
        }

        // Update preferences
        await api.updatePreferences(user.id, {
          intended_majors: profileData.intended_majors,
          preferred_countries: profileData.preferred_countries,
          budget_min: profileData.budget_min,
          budget_max: profileData.budget_max,
          preferred_college_size: profileData.preferred_college_size,
          preferred_setting: profileData.preferred_setting
        });

        // Mark onboarding complete
        await api.completeOnboarding({
          targetCountries: formData.preferred_countries,
          intendedMajors: formData.intended_majors,
          testStatus: {
            sat: { taken: !!formData.sat_total, score: formData.sat_total },
            act: { taken: !!formData.act_composite, score: formData.act_composite },
            ielts: { taken: !!formData.ielts_score, score: formData.ielts_score },
            toefl: { taken: !!formData.toefl_score, score: formData.toefl_score }
          },
          languagePreferences: ['English']
        });

        await refreshUser?.();
      }

      if (onComplete) {
        onComplete();
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      setErrors(['Failed to save profile. Please try again.']);
    }
    setSaving(false);
  };

  // Step indicator labels
  const steps = [
    { num: 1, label: 'Basic Info', icon: GraduationCap },
    { num: 2, label: 'Curriculum', icon: BookOpen },
    { num: 3, label: 'Subjects', icon: Target },
    { num: 4, label: 'Test Scores', icon: Trophy },
    { num: 5, label: 'Activities', icon: FileText },
    { num: 6, label: 'Preferences', icon: Heart },
    { num: 7, label: 'Review', icon: Sparkles }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Complete Your Profile</h1>
          <p className="text-gray-600 mt-2">Step {currentStep} of 7</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {steps.map((step, index) => (
              <React.Fragment key={step.num}>
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all
                    ${currentStep > step.num ? 'bg-green-500 text-white' : 
                      currentStep === step.num ? 'bg-blue-600 text-white' : 
                      'bg-gray-200 text-gray-500'}`}>
                    {currentStep > step.num ? <Check size={20} /> : <step.icon size={18} />}
                  </div>
                  <span className={`text-xs mt-1 hidden md:block
                    ${currentStep >= step.num ? 'text-gray-700' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-1 mx-2 rounded 
                    ${currentStep > step.num ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Save Draft Button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={saveDraft}
            disabled={saving}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <Save size={16} />
            {saveMessage || (saving ? 'Saving...' : 'Save & Continue Later')}
          </button>
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <ul className="list-disc list-inside text-red-700 text-sm">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <GraduationCap className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Welcome! Let&apos;s Get Started</h2>
                <p className="text-gray-600 mt-2">Tell us about yourself</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name *</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => updateFormData('first_name', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Your first name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => updateFormData('last_name', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Your last name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateFormData('email', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="your.email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Country *</label>
                <select
                  value={formData.country}
                  onChange={(e) => updateFormData('country', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select your country</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Curriculum Selection */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Academic System</h2>
                <p className="text-gray-600 mt-2">What curriculum are you following?</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CURRICULUM_TYPES.map(curr => (
                  <button
                    key={curr.value}
                    onClick={() => updateFormData('curriculum_type', curr.value)}
                    className={`p-4 border-2 rounded-xl text-left transition-all
                      ${formData.curriculum_type === curr.value 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{curr.icon}</span>
                      <div>
                        <div className="font-medium text-gray-900">{curr.label}</div>
                        <div className="text-sm text-gray-500">{curr.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Curriculum-specific onboarding */}
          {currentStep === 3 && (
            <>
              {formData.curriculum_type === 'IB' && (
                <IBOnboarding
                  initialData={formData.curriculumData}
                  onComplete={handleCurriculumComplete}
                  onBack={prevStep}
                />
              )}
              {formData.curriculum_type === 'A-Level' && (
                <ALevelOnboarding
                  initialData={formData.curriculumData}
                  onComplete={handleCurriculumComplete}
                  onBack={prevStep}
                />
              )}
              {formData.curriculum_type === 'CBSE' && (
                <CBSEOnboarding
                  initialData={formData.curriculumData}
                  onComplete={handleCurriculumComplete}
                  onBack={prevStep}
                />
              )}
            </>
          )}

          {/* Step 4: Test Scores */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trophy className="w-8 h-8 text-purple-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Test Scores</h2>
                <p className="text-gray-600 mt-2">Add your standardized test scores (optional)</p>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="skip_tests"
                  checked={formData.skip_tests}
                  onChange={(e) => updateFormData('skip_tests', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="skip_tests" className="text-gray-700">Skip for now - I haven&apos;t taken these tests yet</label>
              </div>

              {!formData.skip_tests && (
                <div className="space-y-6">
                  {/* SAT */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">SAT Scores</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm text-gray-600">Total</label>
                        <input
                          type="number"
                          min="400"
                          max="1600"
                          value={formData.sat_total || ''}
                          onChange={(e) => updateFormData('sat_total', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="400-1600"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">Math</label>
                        <input
                          type="number"
                          min="200"
                          max="800"
                          value={formData.sat_math || ''}
                          onChange={(e) => updateFormData('sat_math', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="200-800"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">EBRW</label>
                        <input
                          type="number"
                          min="200"
                          max="800"
                          value={formData.sat_ebrw || ''}
                          onChange={(e) => updateFormData('sat_ebrw', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="200-800"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ACT */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">ACT Score</h3>
                    <input
                      type="number"
                      min="1"
                      max="36"
                      value={formData.act_composite || ''}
                      onChange={(e) => updateFormData('act_composite', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Composite 1-36"
                    />
                  </div>

                  {/* English Proficiency */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">English Proficiency</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-gray-600">IELTS</label>
                        <input
                          type="number"
                          min="0"
                          max="9"
                          step="0.5"
                          value={formData.ielts_score || ''}
                          onChange={(e) => updateFormData('ielts_score', e.target.value ? parseFloat(e.target.value) : null)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="0-9"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">TOEFL</label>
                        <input
                          type="number"
                          min="0"
                          max="120"
                          value={formData.toefl_score || ''}
                          onChange={(e) => updateFormData('toefl_score', e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="0-120"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Activities */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-yellow-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Extracurricular Activities</h2>
                <p className="text-gray-600 mt-2">Add your activities later from the Settings page</p>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="skip_activities"
                  checked={formData.skip_activities}
                  onChange={(e) => updateFormData('skip_activities', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="skip_activities" className="text-gray-700">Skip for now - I&apos;ll add activities later</label>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-700">
                  💡 You can add and manage your extracurricular activities anytime from the Settings page.
                  Activities help colleges understand your interests and achievements outside of academics.
                </p>
              </div>
            </div>
          )}

          {/* Step 6: Preferences */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-pink-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Your Preferences</h2>
                <p className="text-gray-600 mt-2">Help us find the best colleges for you</p>
              </div>

              {/* Intended Majors */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Intended Majors * <span className="text-gray-400">(select up to 3)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {MAJORS.map(major => (
                    <button
                      key={major}
                      onClick={() => {
                        if (formData.intended_majors.length < 3 || formData.intended_majors.includes(major)) {
                          toggleArrayValue('intended_majors', major);
                        }
                      }}
                      className={`px-3 py-2 rounded-lg text-sm transition-all
                        ${formData.intended_majors.includes(major) 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {major}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferred Countries */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Countries</label>
                <div className="flex flex-wrap gap-2">
                  {COUNTRIES.map(country => (
                    <button
                      key={country}
                      onClick={() => toggleArrayValue('preferred_countries', country)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all
                        ${formData.preferred_countries.includes(country) 
                          ? 'bg-green-600 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {country}
                    </button>
                  ))}
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Budget Range</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {BUDGET_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      onClick={() => {
                        updateFormData('budget_range', option.value);
                        updateFormData('budget_min', option.min);
                        updateFormData('budget_max', option.max);
                      }}
                      className={`p-3 border-2 rounded-lg text-left text-sm
                        ${formData.budget_range === option.value 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* College Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">College Size Preference</label>
                <div className="flex gap-2">
                  {['Small', 'Medium', 'Large', 'Any'].map(size => (
                    <button
                      key={size}
                      onClick={() => updateFormData('college_size_preference', size)}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm
                        ${formData.college_size_preference === size 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Campus Setting */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Campus Setting</label>
                <div className="flex gap-2">
                  {['Urban', 'Suburban', 'Rural', 'Any'].map(setting => (
                    <button
                      key={setting}
                      onClick={() => updateFormData('campus_setting_preference', setting)}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm
                        ${formData.campus_setting_preference === setting 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {setting}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 7: Review */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Review Your Profile</h2>
                <p className="text-gray-600 mt-2">Make sure everything looks correct</p>
              </div>

              {/* Review sections */}
              <div className="space-y-4">
                <ReviewSection 
                  title="Basic Info" 
                  onEdit={() => setCurrentStep(1)}
                  items={[
                    { label: 'Name', value: `${formData.first_name} ${formData.last_name}`.trim() },
                    { label: 'Email', value: formData.email },
                    { label: 'Country', value: formData.country }
                  ]}
                />

                <ReviewSection 
                  title="Academic" 
                  onEdit={() => setCurrentStep(2)}
                  items={[
                    { label: 'Curriculum', value: formData.curriculum_type },
                    ...(formData.curriculumData?.stream ? [{ label: 'Stream', value: formData.curriculumData.stream }] : []),
                    ...(formData.curriculumData?.subjects?.length ? [{ label: 'Subjects', value: `${formData.curriculumData.subjects.length} subjects` }] : []),
                    ...(formData.curriculumData?.predicted_total ? [{ label: 'IB Predicted', value: `${formData.curriculumData.predicted_total}/45` }] : [])
                  ]}
                />

                {!formData.skip_tests && (
                  <ReviewSection 
                    title="Test Scores" 
                    onEdit={() => setCurrentStep(4)}
                    items={[
                      ...(formData.sat_total ? [{ label: 'SAT', value: String(formData.sat_total) }] : []),
                      ...(formData.act_composite ? [{ label: 'ACT', value: String(formData.act_composite) }] : []),
                      ...(formData.ielts_score ? [{ label: 'IELTS', value: String(formData.ielts_score) }] : []),
                      ...(formData.toefl_score ? [{ label: 'TOEFL', value: String(formData.toefl_score) }] : [])
                    ]}
                  />
                )}

                <ReviewSection 
                  title="Preferences" 
                  onEdit={() => setCurrentStep(6)}
                  items={[
                    { label: 'Majors', value: formData.intended_majors.join(', ') || 'Not specified' },
                    { label: 'Countries', value: formData.preferred_countries.join(', ') || 'Not specified' },
                    { label: 'Budget', value: BUDGET_OPTIONS.find(b => b.value === formData.budget_range)?.label || 'Not specified' },
                    { label: 'College Size', value: formData.college_size_preference || 'Any' },
                    { label: 'Setting', value: formData.campus_setting_preference || 'Any' }
                  ]}
                />
              </div>
            </div>
          )}

          {/* Navigation Buttons (shown for steps that don't have custom nav) */}
          {![3].includes(currentStep) && (
            <div className="flex justify-between pt-8 border-t mt-8">
              <button
                onClick={prevStep}
                disabled={currentStep === 1}
                className={`flex items-center gap-2 px-6 py-3 text-gray-600 
                  ${currentStep === 1 ? 'invisible' : 'hover:text-gray-900'}`}
              >
                <ArrowLeft size={20} />
                Back
              </button>
              
              {currentStep === 7 ? (
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Complete Setup'}
                  <Sparkles size={20} />
                </button>
              ) : (
                <button
                  onClick={nextStep}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Next
                  <ArrowRight size={20} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Review Section Component
interface ReviewSectionProps {
  title: string;
  onEdit: () => void;
  items: { label: string; value: string }[];
}

const ReviewSection: React.FC<ReviewSectionProps> = ({ title, onEdit, items }) => {
  if (items.length === 0 || items.every(i => !i.value)) return null;
  
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-medium text-gray-900">{title}</h3>
        <button onClick={onEdit} className="text-sm text-blue-600 hover:text-blue-700">
          Edit
        </button>
      </div>
      <div className="space-y-2">
        {items.filter(i => i.value).map(item => (
          <div key={item.label} className="flex">
            <span className="text-gray-500 w-32">{item.label}:</span>
            <span className="text-gray-900">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OnboardingFlow;
