import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, Check, Target, GraduationCap, BookOpen, Trophy, Briefcase, FileText, Heart, Star, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface StudentOnboardingProps {
  onComplete: (profile: any) => void;
}

const StudentOnboarding: React.FC<StudentOnboardingProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [studentData, setStudentData] = useState({
    // Step 1: Basic Info
    name: '',
    grade: '',
    currentBoard: '',
    country: '',
    
    // Step 2: Academic Profile
    currentGPA: '',
    satScore: '',
    actScore: '',
    apScores: [],
    ibPredicted: '',
    subjects: [],
    
    // Step 3: Interests & Major
    careerInterests: [],
    majorCertain: null,
    potentialMajors: [],
    skillsStrengths: [],
    
    // Step 4: Preferences
    preferredCountries: [],
    budgetRange: '',
    campusSize: '',
    locationPreference: '',
    
    // Step 5: Extracurriculars
    activities: [],
    leadership: [],
    awards: [],
    
    // Step 6: Goals
    careerGoals: '',
    whyCollege: ''
  });

  const updateData = (field, value) => {
    setStudentData(prev => ({ ...prev, [field]: value }));
  };

  const nextStep = () => setStep(prev => Math.min(prev + 1, 7));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

  const boards = ['CBSE', 'ISC', 'ICSE', 'IB', 'IGCSE', 'A-Levels', 'State Board'];
  const grades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'Gap Year'];
  const countries = ['India', 'USA', 'UK', 'Canada', 'Singapore', 'UAE', 'Other'];
  
  const majors = [
    'Computer Science', 'Engineering', 'Business/Management', 'Medicine',
    'Psychology', 'Economics', 'Data Science', 'Biology', 'Mathematics',
    'Physics', 'Chemistry', 'Arts/Design', 'Political Science', 'Law',
    'Architecture', 'Environmental Science', 'Communications', 'Undecided'
  ];

  const skills = [
    'Problem Solving', 'Creativity', 'Analytical Thinking', 'Leadership',
    'Communication', 'Research', 'Programming', 'Writing', 'Mathematics',
    'Science', 'Languages', 'Public Speaking', 'Teamwork', 'Design'
  ];

  const budgets = [
    'Under $20,000/year',
    '$20,000 - $40,000/year',
    '$40,000 - $60,000/year',
    '$60,000+/year',
    'Need Full Financial Aid'
  ];

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <GraduationCap className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Welcome! Let's Get Started</h2>
              <p className="text-gray-600 mt-2">Tell us about yourself</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
                <input
                  type="text"
                  value={studentData.name}
                  onChange={(e) => updateData('name', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Current Grade</label>
                <select
                  value={studentData.grade}
                  onChange={(e) => updateData('grade', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select your grade</option>
                  {grades.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Education Board</label>
                <select
                  value={studentData.currentBoard}
                  onChange={(e) => updateData('currentBoard', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select your board</option>
                  {boards.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                <select
                  value={studentData.country}
                  onChange={(e) => updateData('country', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select your country</option>
                  {countries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Academic Profile</h2>
              <p className="text-gray-600 mt-2">Share your academic achievements</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current GPA / Percentage
                </label>
                <input
                  type="text"
                  value={studentData.currentGPA}
                  onChange={(e) => updateData('currentGPA', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 90% or 3.8 GPA"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SAT Score (if taken)
                  </label>
                  <input
                    type="number"
                    value={studentData.satScore}
                    onChange={(e) => updateData('satScore', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 1450"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ACT Score (if taken)
                  </label>
                  <input
                    type="number"
                    value={studentData.actScore}
                    onChange={(e) => updateData('actScore', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 32"
                  />
                </div>
              </div>

              {studentData.currentBoard === 'IB' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    IB Predicted Score
                  </label>
                  <input
                    type="number"
                    value={studentData.ibPredicted}
                    onChange={(e) => updateData('ibPredicted', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 40"
                    max="45"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Subjects (select all that apply)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Economics', 'History', 'English'].map(subject => (
                    <label key={subject} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={studentData.subjects.includes(subject)}
                        onChange={(e) => {
                          const subjects = e.target.checked
                            ? [...studentData.subjects, subject]
                            : studentData.subjects.filter(s => s !== subject);
                          updateData('subjects', subjects);
                        }}
                        className="rounded text-blue-600"
                      />
                      <span className="text-sm">{subject}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-purple-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Career Interests & Major</h2>
              <p className="text-gray-600 mt-2">What do you want to study?</p>
            </div>

            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-3">
                  Are you certain about what you want to study?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => updateData('majorCertain', true)}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                      studentData.majorCertain === true
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-50'
                    }`}
                  >
                    Yes, I'm sure
                  </button>
                  <button
                    onClick={() => updateData('majorCertain', false)}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                      studentData.majorCertain === false
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-50'
                    }`}
                  >
                    Not sure yet
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {studentData.majorCertain 
                    ? 'Select your intended major'
                    : 'Select potential majors you\'re considering (choose 2-4)'}
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {majors.map(major => (
                    <label key={major} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                      <input
                        type={studentData.majorCertain ? 'radio' : 'checkbox'}
                        name="major"
                        checked={studentData.potentialMajors.includes(major)}
                        onChange={(e) => {
                          if (studentData.majorCertain) {
                            updateData('potentialMajors', [major]);
                          } else {
                            const majors = e.target.checked
                              ? [...studentData.potentialMajors, major]
                              : studentData.potentialMajors.filter(m => m !== major);
                            updateData('potentialMajors', majors);
                          }
                        }}
                        className="rounded text-purple-600"
                      />
                      <span className="text-sm">{major}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What are you naturally good at? (Select your strengths)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {skills.map(skill => (
                    <label key={skill} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={studentData.skillsStrengths.includes(skill)}
                        onChange={(e) => {
                          const skills = e.target.checked
                            ? [...studentData.skillsStrengths, skill]
                            : studentData.skillsStrengths.filter(s => s !== skill);
                          updateData('skillsStrengths', skills);
                        }}
                        className="rounded text-purple-600"
                      />
                      <span className="text-sm">{skill}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-8 h-8 text-orange-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">College Preferences</h2>
              <p className="text-gray-600 mt-2">Where do you want to study?</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Countries (select all that apply)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['USA', 'UK', 'Canada', 'Australia', 'Germany', 'Netherlands', 'Singapore', 'Ireland'].map(country => (
                    <label key={country} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={studentData.preferredCountries.includes(country)}
                        onChange={(e) => {
                          const countries = e.target.checked
                            ? [...studentData.preferredCountries, country]
                            : studentData.preferredCountries.filter(c => c !== country);
                          updateData('preferredCountries', countries);
                        }}
                        className="rounded text-orange-600"
                      />
                      <span className="text-sm">{country}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Budget Range (annual)
                </label>
                <select
                  value={studentData.budgetRange}
                  onChange={(e) => updateData('budgetRange', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select budget range</option>
                  {budgets.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campus Size Preference
                </label>
                <select
                  value={studentData.campusSize}
                  onChange={(e) => updateData('campusSize', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select preference</option>
                  <option value="small">Small (&lt;5,000 students)</option>
                  <option value="medium">Medium (5,000-15,000 students)</option>
                  <option value="large">Large (&gt;15,000 students)</option>
                  <option value="any">No preference</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location Preference
                </label>
                <select
                  value={studentData.locationPreference}
                  onChange={(e) => updateData('locationPreference', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select preference</option>
                  <option value="urban">Urban / City</option>
                  <option value="suburban">Suburban</option>
                  <option value="rural">Rural / Small Town</option>
                  <option value="any">No preference</option>
                </select>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-pink-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Beyond Academics</h2>
              <p className="text-gray-600 mt-2">Tell us about your extracurriculars</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Extracurricular Activities
                </label>
                <textarea
                  value={studentData.activities.join('\n')}
                  onChange={(e) => updateData('activities', e.target.value.split('\n'))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  rows="4"
                  placeholder="List your activities (one per line)&#10;e.g., Student Council President&#10;Debate Team Captain&#10;Volunteer at NGO"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Awards & Achievements
                </label>
                <textarea
                  value={studentData.awards.join('\n')}
                  onChange={(e) => updateData('awards', e.target.value.split('\n'))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  rows="4"
                  placeholder="List your awards (one per line)&#10;e.g., National Science Olympiad Gold Medal&#10;Best Delegate at MUN&#10;State Level Chess Champion"
                />
              </div>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-indigo-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Your Goals</h2>
              <p className="text-gray-600 mt-2">What drives you?</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Career Goals (What do you want to do after college?)
                </label>
                <textarea
                  value={studentData.careerGoals}
                  onChange={(e) => updateData('careerGoals', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  rows="4"
                  placeholder="Share your aspirations...&#10;e.g., I want to become a software engineer at a leading tech company, or start my own AI startup"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Why College? (What do you hope to gain?)
                </label>
                <textarea
                  value={studentData.whyCollege}
                  onChange={(e) => updateData('whyCollege', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  rows="4"
                  placeholder="What matters most to you?&#10;e.g., Research opportunities, networking, specific programs, personal growth"
                />
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">All Set!</h2>
              <p className="text-gray-600 mt-2">Review and complete your profile</p>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-lg">Profile Summary:</h3>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Name:</span>
                  <p className="font-medium">{studentData.name || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-gray-600">Grade:</span>
                  <p className="font-medium">{studentData.grade || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-gray-600">Board:</span>
                  <p className="font-medium">{studentData.currentBoard || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-gray-600">GPA:</span>
                  <p className="font-medium">{studentData.currentGPA || 'Not provided'}</p>
                </div>
              </div>

              <div>
                <span className="text-gray-600 text-sm">Interested Majors:</span>
                <p className="font-medium">{studentData.potentialMajors.join(', ') || 'Not selected'}</p>
              </div>

              <div>
                <span className="text-gray-600 text-sm">Target Countries:</span>
                <p className="font-medium">{studentData.preferredCountries.join(', ') || 'Not selected'}</p>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                ✨ Once you complete, we'll use AI to match you with perfect colleges and create your personalized roadmap!
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const isStepComplete = () => {
    switch(step) {
      case 1:
        return studentData.name && studentData.grade && studentData.currentBoard && studentData.country;
      case 2:
        return studentData.currentGPA && studentData.subjects.length > 0;
      case 3:
        return studentData.majorCertain !== null && studentData.potentialMajors.length > 0;
      case 4:
        return studentData.preferredCountries.length > 0 && studentData.budgetRange;
      case 5:
        return true; // Optional step
      case 6:
        return studentData.careerGoals.trim().length > 0;
      case 7:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-600">Step {step} of 7</span>
            <span className="text-sm font-medium text-gray-600">{Math.round((step / 7) * 100)}% Complete</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-blue-600 to-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(step / 7) * 100}%` }}
            />
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {renderStep()}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <button
              onClick={prevStep}
              disabled={step === 1}
              className="flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            {step < 7 ? (
              <button
                onClick={nextStep}
                disabled={!isStepComplete()}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => {
                  console.log('Student Profile:', studentData);
                  onComplete(studentData);
                  navigate('/search');
                }}
                disabled={!isStepComplete()}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-semibold"
              >
                <Check className="w-5 h-5" />
                Complete & Get Matches
              </button>
            )}
          </div>
        </div>

        {/* Help Text */}
        <div className="text-center mt-6 text-sm text-gray-600">
          Need help? <button className="text-blue-600 hover:underline">Contact Support</button>
        </div>
      </div>
    </div>
  );
};

export default StudentOnboarding;