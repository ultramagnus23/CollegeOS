/**
 * CBSE Onboarding Component
 * Curriculum-specific onboarding for CBSE (Central Board of Secondary Education) students
 */
import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, HelpCircle, CheckCircle } from 'lucide-react';

// CBSE Streams and their subjects
const CBSE_STREAMS = {
  'Science with Medical': {
    core: ['Physics', 'Chemistry', 'Biology', 'English Core'],
    optional: ['Mathematics', 'Computer Science', 'Physical Education', 'Psychology']
  },
  'Science without Medical': {
    core: ['Physics', 'Chemistry', 'Mathematics', 'English Core'],
    optional: ['Computer Science', 'Physical Education', 'Economics', 'Informatics Practices']
  },
  'Commerce': {
    core: ['Accountancy', 'Business Studies', 'Economics', 'English Core'],
    optional: ['Mathematics', 'Informatics Practices', 'Physical Education', 'Legal Studies']
  },
  'Humanities/Arts': {
    core: ['History', 'Political Science', 'English Core'],
    optional: ['Economics', 'Geography', 'Psychology', 'Sociology', 'Legal Studies', 'Sanskrit', 'Hindi']
  }
};

interface CBSESubject {
  subject_name: string;
  stream: string;
  class_11_marks?: number;
  class_12_marks?: number;
  is_core: boolean;
}

interface CBSEOnboardingProps {
  initialData?: any;
  onComplete: (data: any) => void;
  onBack: () => void;
}

const CBSEOnboarding: React.FC<CBSEOnboardingProps> = ({ initialData, onComplete, onBack }) => {
  const [step, setStep] = useState(1);
  const [cbseData, setCBSEData] = useState({
    stream: initialData?.stream || '',
    subjects: initialData?.subjects || [] as CBSESubject[],
    board_exam_year: initialData?.board_exam_year || new Date().getFullYear() + 1,
    overall_percentage: initialData?.overall_percentage || null,
    school_name: initialData?.school_name || '',
    school_city: initialData?.school_city || ''
  });
  
  const [errors, setErrors] = useState<string[]>([]);

  // Get available subjects based on stream
  const getAvailableSubjects = () => {
    if (!cbseData.stream) return { core: [], optional: [] };
    return CBSE_STREAMS[cbseData.stream as keyof typeof CBSE_STREAMS] || { core: [], optional: [] };
  };

  const handleStreamChange = (stream: string) => {
    setCBSEData(prev => ({
      ...prev,
      stream,
      subjects: [] // Clear subjects when stream changes
    }));
  };

  const toggleSubject = (subjectName: string, isCore: boolean) => {
    setCBSEData(prev => {
      const exists = prev.subjects.find(s => s.subject_name === subjectName);
      
      if (exists) {
        return {
          ...prev,
          subjects: prev.subjects.filter(s => s.subject_name !== subjectName)
        };
      } else {
        return {
          ...prev,
          subjects: [...prev.subjects, {
            subject_name: subjectName,
            stream: prev.stream,
            is_core: isCore
          }]
        };
      }
    });
  };

  const updateSubjectMarks = (subjectName: string, field: 'class_11_marks' | 'class_12_marks', value: number | null) => {
    setCBSEData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => 
        s.subject_name === subjectName ? { ...s, [field]: value } : s
      )
    }));
  };

  const isSubjectSelected = (subjectName: string) => {
    return cbseData.subjects.some(s => s.subject_name === subjectName);
  };

  const validateStep1 = () => {
    if (!cbseData.stream) {
      setErrors(['Please select your stream']);
      return false;
    }
    setErrors([]);
    return true;
  };

  const validateStep2 = () => {
    const newErrors: string[] = [];
    const { core } = getAvailableSubjects();
    
    // Check all core subjects are selected
    const selectedCore = cbseData.subjects.filter(s => s.is_core);
    if (selectedCore.length < core.length) {
      newErrors.push(`Please select all core subjects for ${cbseData.stream}`);
    }
    
    // Check at least one optional subject
    const selectedOptional = cbseData.subjects.filter(s => !s.is_core);
    if (selectedOptional.length === 0) {
      newErrors.push('Please select at least one optional subject');
    }
    
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const validateStep3 = () => {
    const newErrors: string[] = [];
    
    if (!cbseData.board_exam_year) {
      newErrors.push('Please select your board exam year');
    }
    
    if (!cbseData.school_name) {
      newErrors.push('Please enter your school name');
    }
    
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    } else if (step === 3 && validateStep3()) {
      const finalData = {
        ...cbseData,
        curriculum_type: 'CBSE'
      };
      onComplete(finalData);
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1);
      setErrors([]);
    } else {
      onBack();
    }
  };

  const { core, optional } = getAvailableSubjects();

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              ${s < step ? 'bg-green-500 text-white' : s === step ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {s < step ? <CheckCircle size={16} /> : s}
            </div>
            {s < 3 && <div className={`w-12 h-1 ${s < step ? 'bg-green-500' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <ul className="list-disc list-inside text-red-700 text-sm">
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Step 1: Stream Selection */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">CBSE Stream</h2>
            <p className="text-gray-600 mt-2">Which stream are you in?</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(CBSE_STREAMS).map(stream => (
              <button
                key={stream}
                onClick={() => handleStreamChange(stream)}
                className={`p-6 border-2 rounded-xl text-left transition-all
                  ${cbseData.stream === stream 
                    ? 'border-orange-500 bg-orange-50' 
                    : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="font-medium text-gray-900 text-lg">{stream}</div>
                <div className="text-sm text-gray-600 mt-2">
                  Core: {CBSE_STREAMS[stream as keyof typeof CBSE_STREAMS].core.join(', ')}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Subject Selection */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Select Your Subjects</h2>
            <p className="text-gray-600 mt-2">Choose subjects and enter your marks</p>
          </div>

          {/* Core Subjects */}
          <div className="bg-orange-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              Core Subjects (Required)
              <span className="text-xs text-orange-600 font-normal">{cbseData.stream}</span>
            </h3>
            
            <div className="space-y-3">
              {core.map(subject => (
                <div key={subject} className={`p-4 rounded-lg border-2 transition-all
                  ${isSubjectSelected(subject) ? 'bg-white border-orange-300' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-3 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSubjectSelected(subject)}
                        onChange={() => toggleSubject(subject, true)}
                        className="w-5 h-5 text-orange-600 rounded"
                      />
                      <span className="font-medium text-gray-900">{subject}</span>
                    </label>
                    
                    {isSubjectSelected(subject) && (
                      <div className="flex gap-3">
                        <div>
                          <label className="text-xs text-gray-500">Class 11</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="%"
                            value={cbseData.subjects.find(s => s.subject_name === subject)?.class_11_marks || ''}
                            onChange={(e) => updateSubjectMarks(subject, 'class_11_marks', e.target.value ? parseInt(e.target.value) : null)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Class 12</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="%"
                            value={cbseData.subjects.find(s => s.subject_name === subject)?.class_12_marks || ''}
                            onChange={(e) => updateSubjectMarks(subject, 'class_12_marks', e.target.value ? parseInt(e.target.value) : null)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Optional Subjects */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              Optional Subjects
              <button className="text-gray-400 hover:text-gray-600">
                <HelpCircle size={14} />
              </button>
            </h3>
            
            <div className="space-y-3">
              {optional.map(subject => (
                <div key={subject} className={`p-4 rounded-lg border-2 transition-all
                  ${isSubjectSelected(subject) ? 'bg-white border-blue-300' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-3 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSubjectSelected(subject)}
                        onChange={() => toggleSubject(subject, false)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="font-medium text-gray-900">{subject}</span>
                    </label>
                    
                    {isSubjectSelected(subject) && (
                      <div className="flex gap-3">
                        <div>
                          <label className="text-xs text-gray-500">Class 11</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="%"
                            value={cbseData.subjects.find(s => s.subject_name === subject)?.class_11_marks || ''}
                            onChange={(e) => updateSubjectMarks(subject, 'class_11_marks', e.target.value ? parseInt(e.target.value) : null)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Class 12</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="%"
                            value={cbseData.subjects.find(s => s.subject_name === subject)?.class_12_marks || ''}
                            onChange={(e) => updateSubjectMarks(subject, 'class_12_marks', e.target.value ? parseInt(e.target.value) : null)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="text-sm text-gray-600">
            Selected: {cbseData.subjects.length} subjects ({cbseData.subjects.filter(s => s.is_core).length} core + {cbseData.subjects.filter(s => !s.is_core).length} optional)
          </div>
        </div>
      )}

      {/* Step 3: Board Exam Info */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Board Exam Information</h2>
            <p className="text-gray-600 mt-2">Tell us about your CBSE board exams</p>
          </div>

          <div className="space-y-6">
            {/* Board Exam Year */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Board Exam Year (Class 12)
              </label>
              <select
                value={cbseData.board_exam_year}
                onChange={(e) => setCBSEData(prev => ({ ...prev, board_exam_year: parseInt(e.target.value) }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              >
                {[2024, 2025, 2026, 2027].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* Overall Percentage (if completed) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Overall Class 12 Percentage (if completed)
                <span className="text-gray-400 font-normal ml-2">Optional</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="Enter percentage"
                  value={cbseData.overall_percentage || ''}
                  onChange={(e) => setCBSEData(prev => ({ 
                    ...prev, 
                    overall_percentage: e.target.value ? parseFloat(e.target.value) : null 
                  }))}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>

            {/* School Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                School Name
              </label>
              <input
                type="text"
                placeholder="e.g., Delhi Public School, R.K. Puram"
                value={cbseData.school_name}
                onChange={(e) => setCBSEData(prev => ({ ...prev, school_name: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              />
            </div>

            {/* School City */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                School City
              </label>
              <input
                type="text"
                placeholder="e.g., New Delhi"
                value={cbseData.school_city}
                onChange={(e) => setCBSEData(prev => ({ ...prev, school_city: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-xl p-6 mt-6">
            <h3 className="font-medium text-gray-900 mb-3">Your CBSE Profile</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <div>Stream: <span className="font-medium text-gray-900">{cbseData.stream}</span></div>
              <div>Subjects: <span className="font-medium text-gray-900">{cbseData.subjects.length}</span></div>
              <div>Board Exam Year: <span className="font-medium text-gray-900">{cbseData.board_exam_year}</span></div>
              {cbseData.overall_percentage && (
                <div>Overall Percentage: <span className="font-medium text-gray-900">{cbseData.overall_percentage}%</span></div>
              )}
              {cbseData.school_name && (
                <div>School: <span className="font-medium text-gray-900">{cbseData.school_name}{cbseData.school_city && `, ${cbseData.school_city}`}</span></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-6 border-t">
        <button
          onClick={handlePrev}
          className="flex items-center gap-2 px-6 py-3 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
        >
          {step === 3 ? 'Complete' : 'Next'}
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
};

export default CBSEOnboarding;
