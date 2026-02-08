/**
 * A-Level Onboarding Component
 * Curriculum-specific onboarding for A-Level students
 */
import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, HelpCircle, CheckCircle, Plus, X } from 'lucide-react';

// A-Level Subject Categories
const A_LEVEL_SUBJECTS = {
  sciences: [
    'Biology', 'Chemistry', 'Physics', 'Mathematics', 'Further Mathematics',
    'Computer Science'
  ],
  social_sciences: [
    'Economics', 'Business Studies', 'Accounting', 'Law', 'Psychology', 'Sociology'
  ],
  humanities: [
    'History', 'Geography', 'Politics', 'Religious Studies', 'Philosophy',
    'Classical Civilisation'
  ],
  languages: [
    'English Literature', 'English Language', 'French', 'Spanish', 'German',
    'Mandarin Chinese', 'Arabic', 'Italian', 'Japanese', 'Russian'
  ],
  arts: [
    'Art and Design', 'Music', 'Drama and Theatre Studies', 'Media Studies',
    'Photography', 'Film Studies'
  ],
  other: [
    'Physical Education', 'Design and Technology', 'Environmental Science',
    'Statistics', 'Electronics'
  ]
};

const EXAM_BOARDS = [
  { value: 'Cambridge International (CIE)', label: 'Cambridge International (CIE)' },
  { value: 'Edexcel Pearson', label: 'Edexcel Pearson' },
  { value: 'AQA', label: 'AQA' },
  { value: 'OCR', label: 'OCR' },
  { value: 'Other', label: 'Other' }
];

const GRADES = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'];

interface ALevelSubject {
  subject_name: string;
  predicted_grade: string;
  final_grade?: string;
  exam_board?: string;
  year: 'AS' | 'A2';
}

interface ASLevelSubject {
  subject_name: string;
  grade: string;
}

interface ALevelOnboardingProps {
  initialData?: any;
  onComplete: (data: any) => void;
  onBack: () => void;
}

const ALevelOnboarding: React.FC<ALevelOnboardingProps> = ({ initialData, onComplete, onBack }) => {
  const [step, setStep] = useState(1);
  const [aLevelData, setALevelData] = useState({
    exam_board: initialData?.exam_board || '',
    subjects: initialData?.subjects || [] as ALevelSubject[],
    as_levels: initialData?.as_levels || [] as ASLevelSubject[],
    epq_completed: initialData?.epq_completed || false,
    epq_grade: initialData?.epq_grade || ''
  });
  
  const [errors, setErrors] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState<Partial<ALevelSubject>>({});
  const [newASLevel, setNewASLevel] = useState<Partial<ASLevelSubject>>({});

  const allSubjects = Object.values(A_LEVEL_SUBJECTS).flat();

  const addSubject = () => {
    if (!newSubject.subject_name) {
      setErrors(['Please select a subject']);
      return;
    }
    
    if (aLevelData.subjects.length >= 4) {
      setErrors(['Maximum 4 A-Level subjects allowed']);
      return;
    }
    
    if (aLevelData.subjects.some(s => s.subject_name === newSubject.subject_name)) {
      setErrors(['Subject already added']);
      return;
    }
    
    setALevelData(prev => ({
      ...prev,
      subjects: [...prev.subjects, {
        subject_name: newSubject.subject_name!,
        predicted_grade: newSubject.predicted_grade || 'B',
        year: (newSubject.year as 'AS' | 'A2') || 'A2'
      }]
    }));
    setNewSubject({});
    setErrors([]);
  };

  const removeSubject = (subjectName: string) => {
    setALevelData(prev => ({
      ...prev,
      subjects: prev.subjects.filter(s => s.subject_name !== subjectName)
    }));
  };

  const updateSubject = (subjectName: string, field: string, value: string) => {
    setALevelData(prev => ({
      ...prev,
      subjects: prev.subjects.map(s => 
        s.subject_name === subjectName ? { ...s, [field]: value } : s
      )
    }));
  };

  const addASLevel = () => {
    if (!newASLevel.subject_name) {
      return;
    }
    
    if (aLevelData.as_levels.some(s => s.subject_name === newASLevel.subject_name)) {
      return;
    }
    
    setALevelData(prev => ({
      ...prev,
      as_levels: [...prev.as_levels, {
        subject_name: newASLevel.subject_name!,
        grade: newASLevel.grade || 'B'
      }]
    }));
    setNewASLevel({});
  };

  const removeASLevel = (subjectName: string) => {
    setALevelData(prev => ({
      ...prev,
      as_levels: prev.as_levels.filter(s => s.subject_name !== subjectName)
    }));
  };

  const validateStep1 = () => {
    if (!aLevelData.exam_board) {
      setErrors(['Please select your exam board']);
      return false;
    }
    setErrors([]);
    return true;
  };

  const validateStep2 = () => {
    if (aLevelData.subjects.length < 3) {
      setErrors(['You must add at least 3 A-Level subjects']);
      return false;
    }
    setErrors([]);
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    } else if (step === 3) {
      const finalData = {
        ...aLevelData,
        curriculum_type: 'A-Level'
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

      {/* Step 1: Exam Board */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">A-Level Exam Board</h2>
            <p className="text-gray-600 mt-2">Which exam board are you registered with?</p>
          </div>

          <div className="space-y-3">
            {EXAM_BOARDS.map(board => (
              <button
                key={board.value}
                onClick={() => setALevelData(prev => ({ ...prev, exam_board: board.value }))}
                className={`w-full p-4 border-2 rounded-lg text-left transition-all
                  ${aLevelData.exam_board === board.value 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="font-medium text-gray-900">{board.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Subject Selection */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">A-Level Subjects</h2>
            <p className="text-gray-600 mt-2">Add your 3-4 A-Level subjects</p>
            <div className="mt-2 text-sm text-gray-500">
              {aLevelData.subjects.length}/4 subjects added
            </div>
          </div>

          {/* Add Subject Form */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={newSubject.subject_name || ''}
                onChange={(e) => setNewSubject(prev => ({ ...prev, subject_name: e.target.value }))}
                className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select subject...</option>
                {Object.entries(A_LEVEL_SUBJECTS).map(([category, subjects]) => (
                  <optgroup key={category} label={category.replace('_', ' ').toUpperCase()}>
                    {subjects.map(subj => (
                      <option 
                        key={subj} 
                        value={subj}
                        disabled={aLevelData.subjects.some(s => s.subject_name === subj)}
                      >
                        {subj}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <select
                value={newSubject.predicted_grade || ''}
                onChange={(e) => setNewSubject(prev => ({ ...prev, predicted_grade: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Grade...</option>
                {GRADES.map(grade => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>

              <button
                onClick={addSubject}
                disabled={aLevelData.subjects.length >= 4}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                <Plus size={18} />
                Add
              </button>
            </div>
          </div>

          {/* Subject List */}
          <div className="space-y-3">
            {aLevelData.subjects.map(subject => (
              <div key={subject.subject_name} className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{subject.subject_name}</div>
                </div>
                
                <select
                  value={subject.predicted_grade}
                  onChange={(e) => updateSubject(subject.subject_name, 'predicted_grade', e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {GRADES.map(grade => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>

                <select
                  value={subject.year}
                  onChange={(e) => updateSubject(subject.subject_name, 'year', e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="AS">AS (Year 12)</option>
                  <option value="A2">A2 (Year 13)</option>
                </select>

                <button
                  onClick={() => removeSubject(subject.subject_name)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>

          {aLevelData.subjects.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No subjects added yet. Add at least 3 subjects to continue.
            </div>
          )}
        </div>
      )}

      {/* Step 3: Additional Qualifications */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Additional Qualifications</h2>
            <p className="text-gray-600 mt-2">AS-Levels and EPQ (optional)</p>
          </div>

          {/* AS-Levels */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              AS-Level Subjects
              <button className="text-gray-400 hover:text-gray-600">
                <HelpCircle size={14} />
              </button>
            </h3>

            <div className="flex gap-3 mb-4">
              <select
                value={newASLevel.subject_name || ''}
                onChange={(e) => setNewASLevel(prev => ({ ...prev, subject_name: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select AS-Level subject...</option>
                {allSubjects.map(subj => (
                  <option 
                    key={subj} 
                    value={subj}
                    disabled={aLevelData.as_levels.some(s => s.subject_name === subj)}
                  >
                    {subj}
                  </option>
                ))}
              </select>

              <select
                value={newASLevel.grade || ''}
                onChange={(e) => setNewASLevel(prev => ({ ...prev, grade: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Grade...</option>
                {GRADES.map(grade => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </select>

              <button
                onClick={addASLevel}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus size={18} />
              </button>
            </div>

            <div className="space-y-2">
              {aLevelData.as_levels.map(subject => (
                <div key={subject.subject_name} className="flex items-center justify-between p-3 bg-white rounded-lg">
                  <span className="text-gray-900">{subject.subject_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">{subject.grade}</span>
                    <button
                      onClick={() => removeASLevel(subject.subject_name)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {aLevelData.as_levels.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-2">
                  No AS-Levels added (optional)
                </div>
              )}
            </div>
          </div>

          {/* EPQ */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              Extended Project Qualification (EPQ)
              <button className="text-gray-400 hover:text-gray-600">
                <HelpCircle size={14} />
              </button>
            </h3>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aLevelData.epq_completed}
                  onChange={(e) => setALevelData(prev => ({ 
                    ...prev, 
                    epq_completed: e.target.checked,
                    epq_grade: e.target.checked ? prev.epq_grade : ''
                  }))}
                  className="w-5 h-5 text-blue-600 rounded"
                />
                <span className="text-gray-700">I have completed / am completing EPQ</span>
              </label>

              {aLevelData.epq_completed && (
                <select
                  value={aLevelData.epq_grade}
                  onChange={(e) => setALevelData(prev => ({ ...prev, epq_grade: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">EPQ Grade...</option>
                  {GRADES.map(grade => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
            <h3 className="font-medium text-gray-900 mb-3">Your A-Level Summary</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <div>Exam Board: <span className="font-medium text-gray-900">{aLevelData.exam_board}</span></div>
              <div>A-Level Subjects: <span className="font-medium text-gray-900">{aLevelData.subjects.length}</span></div>
              <div>
                Predicted Grades: {' '}
                <span className="font-medium text-gray-900">
                  {aLevelData.subjects.map(s => s.predicted_grade).join(', ') || 'N/A'}
                </span>
              </div>
              {aLevelData.as_levels.length > 0 && (
                <div>AS-Levels: <span className="font-medium text-gray-900">{aLevelData.as_levels.length}</span></div>
              )}
              {aLevelData.epq_completed && (
                <div>EPQ: <span className="font-medium text-gray-900">{aLevelData.epq_grade || 'In Progress'}</span></div>
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
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {step === 3 ? 'Complete' : 'Next'}
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
};

export default ALevelOnboarding;
