/**
 * IB Onboarding Component
 * Curriculum-specific onboarding for International Baccalaureate students
 */
import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, HelpCircle, CheckCircle } from 'lucide-react';

// IB Subject Groups
const IB_GROUPS = {
  1: {
    name: 'Studies in Language and Literature',
    subjects: [
      'English A: Literature', 'English A: Language and Literature',
      'Hindi A', 'Spanish A', 'French A', 'German A', 'Mandarin A',
      'Arabic A', 'Japanese A', 'Korean A', 'Portuguese A', 'Other Language A'
    ]
  },
  2: {
    name: 'Language Acquisition',
    subjects: [
      'English B', 'French B', 'Spanish B', 'Mandarin B', 'German B',
      'Arabic B', 'Hindi B', 'Japanese B', 'Italian B', 'Korean B',
      'Latin', 'Classical Greek', 'Other Language ab initio'
    ]
  },
  3: {
    name: 'Individuals and Societies',
    subjects: [
      'Economics', 'Business Management', 'Psychology', 'History',
      'Geography', 'Global Politics', 'Philosophy', 
      'Social and Cultural Anthropology', 'Digital Society',
      'Environmental Systems and Societies'
    ]
  },
  4: {
    name: 'Sciences',
    subjects: [
      'Biology', 'Chemistry', 'Physics', 'Computer Science',
      'Design Technology', 'Sports, Exercise and Health Science',
      'Environmental Systems and Societies'
    ]
  },
  5: {
    name: 'Mathematics',
    subjects: [
      'Mathematics: Analysis and Approaches HL',
      'Mathematics: Analysis and Approaches SL',
      'Mathematics: Applications and Interpretation HL',
      'Mathematics: Applications and Interpretation SL'
    ]
  },
  6: {
    name: 'The Arts (or additional Group 1-4)',
    subjects: [
      'Visual Arts', 'Music', 'Theatre', 'Film', 'Dance',
      '-- Additional Group 3 Subject --',
      '-- Additional Group 4 Subject --'
    ]
  }
};

// TOK/EE Bonus Points Matrix
const BONUS_POINTS: { [key: string]: { [key: string]: number } } = {
  'A': { 'A': 3, 'B': 3, 'C': 2, 'D': 2, 'E': 0 },
  'B': { 'A': 3, 'B': 2, 'C': 2, 'D': 1, 'E': 0 },
  'C': { 'A': 2, 'B': 2, 'C': 1, 'D': 0, 'E': 0 },
  'D': { 'A': 2, 'B': 1, 'C': 0, 'D': 0, 'E': 0 },
  'E': { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0 }
};

interface IBSubject {
  subject_name: string;
  group: number;
  level: 'HL' | 'SL';
  predicted_grade: number;
}

interface IBOnboardingProps {
  initialData?: any;
  onComplete: (data: any) => void;
  onBack: () => void;
}

const IBOnboarding: React.FC<IBOnboardingProps> = ({ initialData, onComplete, onBack }) => {
  const [step, setStep] = useState(1);
  const [ibData, setIBData] = useState({
    ib_program_type: initialData?.ib_program_type || '',
    subjects: initialData?.subjects || [] as IBSubject[],
    tok_grade: initialData?.tok_grade || '',
    ee_grade: initialData?.ee_grade || '',
    predicted_total: initialData?.predicted_total || 0
  });
  
  const [errors, setErrors] = useState<string[]>([]);

  // Calculate HL count
  const hlCount = ibData.subjects.filter(s => s.level === 'HL').length;
  const slCount = ibData.subjects.filter(s => s.level === 'SL').length;

  // Calculate predicted total
  const calculatePredictedTotal = () => {
    const subjectTotal = ibData.subjects.reduce((sum, s) => sum + (s.predicted_grade || 0), 0);
    const bonusPoints = BONUS_POINTS[ibData.tok_grade]?.[ibData.ee_grade] || 0;
    return subjectTotal + bonusPoints;
  };

  const handleSubjectChange = (group: number, field: string, value: any) => {
    const existingSubject = ibData.subjects.find(s => s.group === group);
    
    if (existingSubject) {
      setIBData(prev => ({
        ...prev,
        subjects: prev.subjects.map(s => 
          s.group === group ? { ...s, [field]: value } : s
        )
      }));
    } else {
      setIBData(prev => ({
        ...prev,
        subjects: [...prev.subjects, { group, [field]: value, level: 'SL', predicted_grade: 4 } as IBSubject]
      }));
    }
  };

  const getSubjectForGroup = (group: number): IBSubject | undefined => {
    return ibData.subjects.find(s => s.group === group);
  };

  const validateStep1 = () => {
    if (!ibData.ib_program_type) {
      setErrors(['Please select your IB program type']);
      return false;
    }
    setErrors([]);
    return true;
  };

  const validateStep2 = () => {
    const newErrors: string[] = [];
    
    if (ibData.subjects.length !== 6) {
      newErrors.push('You must select 6 subjects (one from each group)');
    }
    
    if (hlCount < 3 || hlCount > 4) {
      newErrors.push('You must have 3 or 4 subjects at HL level');
    }
    
    for (let i = 1; i <= 6; i++) {
      const subject = getSubjectForGroup(i);
      if (!subject?.subject_name) {
        newErrors.push(`Please select a subject for Group ${i}`);
      }
    }
    
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const validateStep3 = () => {
    const newErrors: string[] = [];
    
    if (!ibData.tok_grade) {
      newErrors.push('Please select your TOK grade');
    }
    
    if (!ibData.ee_grade) {
      newErrors.push('Please select your Extended Essay grade');
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
        ...ibData,
        curriculum_type: 'IB',
        predicted_total: calculatePredictedTotal()
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

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              ${s < step ? 'bg-green-500 text-white' : s === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
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

      {/* Step 1: Program Type */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">IB Program</h2>
            <p className="text-gray-600 mt-2">Which IB program are you pursuing?</p>
          </div>

          <div className="space-y-4">
            {[
              { value: 'Diploma Programme', label: 'IB Diploma Programme', desc: 'Full diploma with 6 subjects + Core' },
              { value: 'Course Certificate', label: 'IB Course Certificates', desc: 'Individual IB courses without full diploma' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setIBData(prev => ({ ...prev, ib_program_type: option.value }))}
                className={`w-full p-4 border-2 rounded-lg text-left transition-all
                  ${ibData.ib_program_type === option.value 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="font-medium text-gray-900">{option.label}</div>
                <div className="text-sm text-gray-600">{option.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Subject Selection */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">IB Subjects</h2>
            <p className="text-gray-600 mt-2">Select your 6 subjects (3-4 at HL)</p>
            <div className="mt-2 text-sm">
              <span className={hlCount >= 3 && hlCount <= 4 ? 'text-green-600' : 'text-orange-600'}>
                HL: {hlCount}/3-4
              </span>
              <span className="mx-2">|</span>
              <span className={slCount >= 2 && slCount <= 3 ? 'text-green-600' : 'text-orange-600'}>
                SL: {slCount}/2-3
              </span>
            </div>
          </div>

          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {Object.entries(IB_GROUPS).map(([groupNum, group]) => {
              const subject = getSubjectForGroup(parseInt(groupNum));
              return (
                <div key={groupNum} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-medium">
                      {groupNum}
                    </span>
                    <span className="font-medium text-gray-900">{group.name}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Subject Selection */}
                    <select
                      value={subject?.subject_name || ''}
                      onChange={(e) => handleSubjectChange(parseInt(groupNum), 'subject_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Select subject...</option>
                      {group.subjects.map(subj => (
                        <option key={subj} value={subj}>{subj}</option>
                      ))}
                    </select>

                    {/* Level Selection */}
                    <div className="flex gap-2">
                      {['HL', 'SL'].map(level => (
                        <button
                          key={level}
                          onClick={() => handleSubjectChange(parseInt(groupNum), 'level', level)}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all
                            ${subject?.level === level 
                              ? level === 'HL' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>

                    {/* Predicted Grade */}
                    <select
                      value={subject?.predicted_grade || ''}
                      onChange={(e) => handleSubjectChange(parseInt(groupNum), 'predicted_grade', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">Grade...</option>
                      {[7, 6, 5, 4, 3, 2, 1].map(grade => (
                        <option key={grade} value={grade}>{grade}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Core Components */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">IB Core Components</h2>
            <p className="text-gray-600 mt-2">Theory of Knowledge (TOK) and Extended Essay (EE)</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                TOK Grade (Theory of Knowledge)
                <button className="ml-2 text-gray-400 hover:text-gray-600">
                  <HelpCircle size={14} />
                </button>
              </label>
              <select
                value={ibData.tok_grade}
                onChange={(e) => setIBData(prev => ({ ...prev, tok_grade: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              >
                <option value="">Select grade...</option>
                {['A', 'B', 'C', 'D', 'E'].map(grade => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                EE Grade (Extended Essay)
                <button className="ml-2 text-gray-400 hover:text-gray-600">
                  <HelpCircle size={14} />
                </button>
              </label>
              <select
                value={ibData.ee_grade}
                onChange={(e) => setIBData(prev => ({ ...prev, ee_grade: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              >
                <option value="">Select grade...</option>
                {['A', 'B', 'C', 'D', 'E'].map(grade => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Predicted Score Display */}
          {ibData.tok_grade && ibData.ee_grade && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6 mt-6">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-2">Your Predicted IB Score</div>
                <div className="text-4xl font-bold text-blue-700">
                  {calculatePredictedTotal()}/45
                </div>
                <div className="text-sm text-gray-500 mt-2">
                  Subjects: {ibData.subjects.reduce((sum, s) => sum + (s.predicted_grade || 0), 0)} + 
                  Bonus: {BONUS_POINTS[ibData.tok_grade]?.[ibData.ee_grade] || 0}
                </div>
              </div>
            </div>
          )}
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
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {step === 3 ? 'Complete' : 'Next'}
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
};

export default IBOnboarding;
