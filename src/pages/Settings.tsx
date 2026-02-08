import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  User as UserIcon, Globe, BookOpen, TestTube, Trophy, Target, Heart, 
  Edit2, Save, X, Plus, Trash2, CheckCircle, AlertCircle, Loader2
} from 'lucide-react';
import ProfileCompletionWidget from '@/components/common/ProfileCompletionWidget';
import HelpTooltip, { FIELD_HELP_TEXT } from '@/components/common/HelpTooltip';
import { ValidationMessage, useFormValidation, ValidationRules } from '@/hooks/useFormValidation';
import { useAutosave, DraftRestoreBanner } from '@/hooks/useAutosave';

// Section configuration for navigation
const SECTIONS = [
  { id: 'basic', label: 'Basic Information', icon: UserIcon },
  { id: 'academic', label: 'Academic Info', icon: BookOpen },
  { id: 'test-scores', label: 'Test Scores', icon: TestTube },
  { id: 'preferences', label: 'Preferences', icon: Target },
  { id: 'activities', label: 'Activities', icon: Trophy },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

// Constants
const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Canada', 'Australia',
  'Singapore', 'UAE', 'Germany', 'France', 'Netherlands', 'Other'
];

const CURRICULUM_TYPES = ['IB', 'A-Level', 'CBSE', 'ICSE', 'ISC', 'AP', 'US', 'Other'];

const MAJORS = [
  'Computer Science', 'Engineering', 'Business/Management', 'Medicine',
  'Psychology', 'Economics', 'Data Science', 'Biology', 'Mathematics',
  'Physics', 'Chemistry', 'Arts/Design', 'Political Science', 'Law',
  'Architecture', 'Environmental Science', 'Communications', 'Undecided'
];

const ACTIVITY_TYPES = [
  'Sports', 'Arts', 'Academic', 'Community Service', 'Work Experience',
  'Family Responsibilities', 'Clubs', 'Leadership', 'Research', 'Other'
];

interface ProfileData {
  user: any;
  profile: any;
  activities: any[];
}

const Settings = () => {
  const { user, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [completionStatus, setCompletionStatus] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('basic');
  
  // Section refs for scrolling
  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    basic: null,
    academic: null,
    'test-scores': null,
    preferences: null,
    activities: null
  });
  
  // Edit modes for each section
  const [editMode, setEditMode] = useState<{ [key: string]: boolean }>({
    basic: false,
    academic: false,
    testScores: false,
    preferences: false,
    activities: false
  });
  
  // Form data for editing
  const [formData, setFormData] = useState<any>({});
  const [newActivity, setNewActivity] = useState<any>({
    activity_name: '',
    activity_type: '',
    position_title: '',
    description: '',
    hours_per_week: '',
    weeks_per_year: ''
  });

  // Handle hash-based navigation
  useEffect(() => {
    const hash = location.hash.replace('#', '') as SectionId;
    if (hash && SECTIONS.some(s => s.id === hash)) {
      setActiveSection(hash);
      // Scroll to section after a short delay to allow render
      setTimeout(() => {
        sectionRefs.current[hash]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [location.hash]);

  const navigateToSection = (sectionId: SectionId) => {
    setActiveSection(sectionId);
    navigate(`/settings#${sectionId}`, { replace: true });
    sectionRefs.current[sectionId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Load profile data
  useEffect(() => {
    if (user?.id) {
      loadProfile();
    }
  }, [user?.id]);

  const loadProfile = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const [profileResponse, completionResponse] = await Promise.all([
        api.getProfileById(user.id),
        api.getCompletionStatus(user.id)
      ]);
      
      setProfileData(profileResponse.data);
      setCompletionStatus(completionResponse.data);
      initFormData(profileResponse.data);
    } catch (error) {
      console.error('Failed to load profile:', error);
      showMessage('error', 'Failed to load profile');
    }
    setLoading(false);
  };

  const initFormData = (data: ProfileData) => {
    if (!data) return;
    
    setFormData({
      // Basic info
      first_name: data.profile?.first_name || '',
      last_name: data.profile?.last_name || '',
      email: data.profile?.email || data.user?.email || '',
      phone: data.profile?.phone || '',
      country: data.profile?.country || data.user?.country || '',
      grade_level: data.profile?.grade_level || '',
      graduation_year: data.profile?.graduation_year || '',
      
      // Academic
      curriculum_type: data.profile?.curriculum_type || '',
      stream: data.profile?.stream || '',
      gpa_weighted: data.profile?.gpa_weighted || '',
      gpa_unweighted: data.profile?.gpa_unweighted || '',
      class_rank: data.profile?.class_rank || '',
      class_size: data.profile?.class_size || '',
      high_school_name: data.profile?.high_school_name || '',
      
      // Test scores
      sat_total: data.profile?.sat_total || '',
      sat_math: data.profile?.sat_math || '',
      sat_ebrw: data.profile?.sat_ebrw || '',
      act_composite: data.profile?.act_composite || '',
      ielts_score: data.profile?.ielts_score || '',
      toefl_score: data.profile?.toefl_score || '',
      
      // Preferences
      intended_majors: data.profile?.intendedMajors || data.profile?.intended_majors || [],
      preferred_countries: data.profile?.preferredCountries || data.profile?.preferred_countries || [],
      budget_min: data.profile?.budget_min || '',
      budget_max: data.profile?.budget_max || '',
      preferred_college_size: data.profile?.preferred_college_size || '',
      preferred_setting: data.profile?.preferred_setting || ''
    });
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setSaveMessage({ type, text });
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const toggleEditMode = (section: string) => {
    setEditMode(prev => ({ ...prev, [section]: !prev[section] }));
    if (editMode[section]) {
      // Cancel - reload original data
      initFormData(profileData!);
    }
  };

  const updateFormField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const toggleArrayValue = (field: string, value: string) => {
    setFormData((prev: any) => {
      const arr = prev[field] || [];
      if (arr.includes(value)) {
        return { ...prev, [field]: arr.filter((v: string) => v !== value) };
      } else {
        return { ...prev, [field]: [...arr, value] };
      }
    });
  };

  // Save handlers
  const saveBasicInfo = async () => {
    if (!user?.id) return;
    
    setSaving(true);
    try {
      await api.updateBasicInfo(user.id, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone,
        country: formData.country,
        grade_level: formData.grade_level,
        graduation_year: formData.graduation_year ? parseInt(formData.graduation_year) : null
      });
      
      await loadProfile();
      await refreshUser?.();
      setEditMode(prev => ({ ...prev, basic: false }));
      showMessage('success', 'Basic info saved successfully');
    } catch (error: any) {
      console.error('Failed to save basic info:', error);
      showMessage('error', error.message || 'Failed to save');
    }
    setSaving(false);
  };

  const saveAcademicInfo = async () => {
    if (!user?.id) return;
    
    setSaving(true);
    try {
      await api.updateAcademicInfo(user.id, {
        curriculum_type: formData.curriculum_type,
        stream: formData.stream,
        gpa_weighted: formData.gpa_weighted ? parseFloat(formData.gpa_weighted) : null,
        gpa_unweighted: formData.gpa_unweighted ? parseFloat(formData.gpa_unweighted) : null,
        class_rank: formData.class_rank ? parseInt(formData.class_rank) : null,
        class_size: formData.class_size ? parseInt(formData.class_size) : null,
        high_school_name: formData.high_school_name
      });
      
      await loadProfile();
      setEditMode(prev => ({ ...prev, academic: false }));
      showMessage('success', 'Academic info saved successfully');
    } catch (error: any) {
      console.error('Failed to save academic info:', error);
      showMessage('error', error.message || 'Failed to save');
    }
    setSaving(false);
  };

  const saveTestScores = async () => {
    if (!user?.id) return;
    
    setSaving(true);
    try {
      await api.updateTestScores(user.id, {
        sat_total: formData.sat_total ? parseInt(formData.sat_total) : null,
        sat_math: formData.sat_math ? parseInt(formData.sat_math) : null,
        sat_ebrw: formData.sat_ebrw ? parseInt(formData.sat_ebrw) : null,
        act_composite: formData.act_composite ? parseInt(formData.act_composite) : null,
        ielts_score: formData.ielts_score ? parseFloat(formData.ielts_score) : null,
        toefl_score: formData.toefl_score ? parseInt(formData.toefl_score) : null
      });
      
      await loadProfile();
      setEditMode(prev => ({ ...prev, testScores: false }));
      showMessage('success', 'Test scores saved successfully');
    } catch (error: any) {
      console.error('Failed to save test scores:', error);
      showMessage('error', error.message || 'Failed to save');
    }
    setSaving(false);
  };

  const savePreferences = async () => {
    if (!user?.id) return;
    
    setSaving(true);
    try {
      await api.updatePreferences(user.id, {
        intended_majors: formData.intended_majors,
        preferred_countries: formData.preferred_countries,
        budget_min: formData.budget_min ? parseInt(formData.budget_min) : null,
        budget_max: formData.budget_max ? parseInt(formData.budget_max) : null,
        preferred_college_size: formData.preferred_college_size,
        preferred_setting: formData.preferred_setting
      });
      
      await loadProfile();
      setEditMode(prev => ({ ...prev, preferences: false }));
      showMessage('success', 'Preferences saved successfully');
    } catch (error: any) {
      console.error('Failed to save preferences:', error);
      showMessage('error', error.message || 'Failed to save');
    }
    setSaving(false);
  };

  const addActivity = async () => {
    if (!user?.id || !newActivity.activity_name || !newActivity.activity_type) {
      showMessage('error', 'Activity name and type are required');
      return;
    }
    
    setSaving(true);
    try {
      await api.addActivity({
        activity_name: newActivity.activity_name,
        activity_type: newActivity.activity_type,
        position_title: newActivity.position_title,
        description: newActivity.description,
        hours_per_week: newActivity.hours_per_week ? parseInt(newActivity.hours_per_week) : 0,
        weeks_per_year: newActivity.weeks_per_year ? parseInt(newActivity.weeks_per_year) : 0
      });
      
      await loadProfile();
      setNewActivity({
        activity_name: '',
        activity_type: '',
        position_title: '',
        description: '',
        hours_per_week: '',
        weeks_per_year: ''
      });
      showMessage('success', 'Activity added successfully');
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to add activity');
    }
    setSaving(false);
  };

  const deleteActivity = async (activityId: number) => {
    if (!user?.id) return;
    
    if (!confirm('Are you sure you want to delete this activity?')) return;
    
    setSaving(true);
    try {
      await api.deleteActivity(activityId);
      await loadProfile();
      showMessage('success', 'Activity deleted');
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to delete activity');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600">Manage your profile and preferences</p>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
          saveMessage.type === 'success' 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {saveMessage.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {saveMessage.text}
        </div>
      )}

      {/* Profile Completion Widget */}
      <div className="mb-6">
        <ProfileCompletionWidget variant="full" showMissingFields={true} />
      </div>

      {/* Navigation Sidebar + Content */}
      <div className="flex gap-6">
        {/* Section Navigation - Fixed Sidebar */}
        <nav className="hidden md:block w-48 flex-shrink-0">
          <div className="sticky top-8 bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-1">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => navigateToSection(section.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive 
                      ? 'bg-blue-50 text-blue-600 border border-blue-200' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon size={16} />
                  {section.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Mobile Navigation - Horizontal Tabs */}
        <div className="md:hidden mb-4 w-full">
          <div className="flex overflow-x-auto gap-2 pb-2">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => navigateToSection(section.id)}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive 
                      ? 'bg-blue-50 text-blue-600 border border-blue-200' 
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={14} />
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-6">
          {/* Basic Information */}
          <div 
            ref={(el) => { sectionRefs.current.basic = el; }}
            id="basic"
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <UserIcon className="text-blue-600" size={24} />
                <h2 className="text-xl font-bold text-gray-900">Basic Information</h2>
              </div>
              <Button
                variant={editMode.basic ? "ghost" : "outline"}
                size="sm"
                onClick={() => toggleEditMode('basic')}
              >
                {editMode.basic ? <X size={16} /> : <Edit2 size={16} />}
                <span className="ml-2">{editMode.basic ? 'Cancel' : 'Edit'}</span>
              </Button>
            </div>

          {editMode.basic ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input 
                    value={formData.first_name} 
                    onChange={(e) => updateFormField('first_name', e.target.value)}
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input 
                    value={formData.last_name} 
                    onChange={(e) => updateFormField('last_name', e.target.value)}
                    className="mt-1" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input 
                    type="email"
                    value={formData.email} 
                    onChange={(e) => updateFormField('email', e.target.value)}
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input 
                    value={formData.phone} 
                    onChange={(e) => updateFormField('phone', e.target.value)}
                    className="mt-1" 
                    placeholder="+1 234 567 8900"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Country</Label>
                  <select
                    value={formData.country}
                    onChange={(e) => updateFormField('country', e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select country</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Grade Level</Label>
                  <select
                    value={formData.grade_level}
                    onChange={(e) => updateFormField('grade_level', e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select grade</option>
                    {['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'Gap Year'].map(g => 
                      <option key={g} value={g}>{g}</option>
                    )}
                  </select>
                </div>
                <div>
                  <Label>Graduation Year</Label>
                  <Input 
                    type="number"
                    min="2020"
                    max="2035"
                    value={formData.graduation_year} 
                    onChange={(e) => updateFormField('graduation_year', e.target.value)}
                    className="mt-1" 
                    placeholder="2025"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={saveBasicInfo} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Save size={16} className="mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-500 text-sm">Full Name</Label>
                <p className="text-gray-900 font-medium">
                  {`${profileData?.profile?.first_name || ''} ${profileData?.profile?.last_name || ''}`.trim() || 'Not set'}
                </p>
              </div>
              <div>
                <Label className="text-gray-500 text-sm">Email</Label>
                <p className="text-gray-900 font-medium">{profileData?.profile?.email || profileData?.user?.email || 'Not set'}</p>
              </div>
              <div>
                <Label className="text-gray-500 text-sm">Country</Label>
                <p className="text-gray-900 font-medium">{profileData?.profile?.country || profileData?.user?.country || 'Not set'}</p>
              </div>
              <div>
                <Label className="text-gray-500 text-sm">Grade Level</Label>
                <p className="text-gray-900 font-medium">{profileData?.profile?.grade_level || 'Not set'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Academic Profile */}
        <div 
          ref={(el) => { sectionRefs.current.academic = el; }}
          id="academic"
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BookOpen className="text-green-600" size={24} />
              <h2 className="text-xl font-bold text-gray-900">Academic Profile</h2>
            </div>
            <Button
              variant={editMode.academic ? "ghost" : "outline"}
              size="sm"
              onClick={() => toggleEditMode('academic')}
            >
              {editMode.academic ? <X size={16} /> : <Edit2 size={16} />}
              <span className="ml-2">{editMode.academic ? 'Cancel' : 'Edit'}</span>
            </Button>
          </div>

          {editMode.academic ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Curriculum Type</Label>
                  <select
                    value={formData.curriculum_type}
                    onChange={(e) => updateFormField('curriculum_type', e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select curriculum</option>
                    {CURRICULUM_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {formData.curriculum_type === 'CBSE' && (
                  <div>
                    <Label>Stream</Label>
                    <select
                      value={formData.stream}
                      onChange={(e) => updateFormField('stream', e.target.value)}
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="">Select stream</option>
                      {['Science with Medical', 'Science without Medical', 'Commerce', 'Humanities/Arts'].map(s => 
                        <option key={s} value={s}>{s}</option>
                      )}
                    </select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>GPA (Weighted)</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    value={formData.gpa_weighted} 
                    onChange={(e) => updateFormField('gpa_weighted', e.target.value)}
                    className="mt-1" 
                    placeholder="e.g., 3.8"
                  />
                </div>
                <div>
                  <Label>GPA (Unweighted)</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    min="0"
                    max="4"
                    value={formData.gpa_unweighted} 
                    onChange={(e) => updateFormField('gpa_unweighted', e.target.value)}
                    className="mt-1" 
                    placeholder="e.g., 3.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Class Rank</Label>
                  <Input 
                    type="number"
                    min="1"
                    value={formData.class_rank} 
                    onChange={(e) => updateFormField('class_rank', e.target.value)}
                    className="mt-1" 
                    placeholder="e.g., 5"
                  />
                </div>
                <div>
                  <Label>Class Size</Label>
                  <Input 
                    type="number"
                    min="1"
                    value={formData.class_size} 
                    onChange={(e) => updateFormField('class_size', e.target.value)}
                    className="mt-1" 
                    placeholder="e.g., 200"
                  />
                </div>
                <div>
                  <Label>School Name</Label>
                  <Input 
                    value={formData.high_school_name} 
                    onChange={(e) => updateFormField('high_school_name', e.target.value)}
                    className="mt-1" 
                  />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={saveAcademicInfo} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Save size={16} className="mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-500 text-sm">Curriculum</Label>
                <p className="text-gray-900 font-medium">{profileData?.profile?.curriculum_type || 'Not set'}</p>
              </div>
              <div>
                <Label className="text-gray-500 text-sm">GPA</Label>
                <p className="text-gray-900 font-medium">
                  {profileData?.profile?.gpa_weighted || profileData?.profile?.gpa_unweighted || 'Not set'}
                </p>
              </div>
              <div>
                <Label className="text-gray-500 text-sm">Class Rank</Label>
                <p className="text-gray-900 font-medium">
                  {profileData?.profile?.class_rank && profileData?.profile?.class_size 
                    ? `${profileData.profile.class_rank}/${profileData.profile.class_size}` 
                    : 'Not set'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Test Scores */}
        <div 
          ref={(el) => { sectionRefs.current['test-scores'] = el; }}
          id="test-scores"
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <TestTube className="text-purple-600" size={24} />
              <h2 className="text-xl font-bold text-gray-900">Test Scores</h2>
            </div>
            <Button
              variant={editMode.testScores ? "ghost" : "outline"}
              size="sm"
              onClick={() => toggleEditMode('testScores')}
            >
              {editMode.testScores ? <X size={16} /> : <Edit2 size={16} />}
              <span className="ml-2">{editMode.testScores ? 'Cancel' : 'Edit'}</span>
            </Button>
          </div>

          {editMode.testScores ? (
            <div className="space-y-6">
              {/* SAT */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-3">SAT Scores</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Total</Label>
                    <Input 
                      type="number"
                      min="400"
                      max="1600"
                      value={formData.sat_total} 
                      onChange={(e) => updateFormField('sat_total', e.target.value)}
                      className="mt-1" 
                      placeholder="400-1600"
                    />
                  </div>
                  <div>
                    <Label>Math</Label>
                    <Input 
                      type="number"
                      min="200"
                      max="800"
                      value={formData.sat_math} 
                      onChange={(e) => updateFormField('sat_math', e.target.value)}
                      className="mt-1" 
                      placeholder="200-800"
                    />
                  </div>
                  <div>
                    <Label>EBRW</Label>
                    <Input 
                      type="number"
                      min="200"
                      max="800"
                      value={formData.sat_ebrw} 
                      onChange={(e) => updateFormField('sat_ebrw', e.target.value)}
                      className="mt-1" 
                      placeholder="200-800"
                    />
                  </div>
                </div>
              </div>

              {/* ACT */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-3">ACT Score</h3>
                <div className="max-w-xs">
                  <Label>Composite</Label>
                  <Input 
                    type="number"
                    min="1"
                    max="36"
                    value={formData.act_composite} 
                    onChange={(e) => updateFormField('act_composite', e.target.value)}
                    className="mt-1" 
                    placeholder="1-36"
                  />
                </div>
              </div>

              {/* English Proficiency */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-3">English Proficiency</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>IELTS</Label>
                    <Input 
                      type="number"
                      step="0.5"
                      min="0"
                      max="9"
                      value={formData.ielts_score} 
                      onChange={(e) => updateFormField('ielts_score', e.target.value)}
                      className="mt-1" 
                      placeholder="0-9"
                    />
                  </div>
                  <div>
                    <Label>TOEFL</Label>
                    <Input 
                      type="number"
                      min="0"
                      max="120"
                      value={formData.toefl_score} 
                      onChange={(e) => updateFormField('toefl_score', e.target.value)}
                      className="mt-1" 
                      placeholder="0-120"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={saveTestScores} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Save size={16} className="mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <Label className="text-gray-500 text-sm">SAT</Label>
                <p className="text-gray-900 font-medium text-lg">{profileData?.profile?.sat_total || '—'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <Label className="text-gray-500 text-sm">ACT</Label>
                <p className="text-gray-900 font-medium text-lg">{profileData?.profile?.act_composite || '—'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <Label className="text-gray-500 text-sm">IELTS</Label>
                <p className="text-gray-900 font-medium text-lg">{profileData?.profile?.ielts_score || '—'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <Label className="text-gray-500 text-sm">TOEFL</Label>
                <p className="text-gray-900 font-medium text-lg">{profileData?.profile?.toefl_score || '—'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Preferences */}
        <div 
          ref={(el) => { sectionRefs.current.preferences = el; }}
          id="preferences"
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Heart className="text-pink-600" size={24} />
              <h2 className="text-xl font-bold text-gray-900">Preferences</h2>
            </div>
            <Button
              variant={editMode.preferences ? "ghost" : "outline"}
              size="sm"
              onClick={() => toggleEditMode('preferences')}
            >
              {editMode.preferences ? <X size={16} /> : <Edit2 size={16} />}
              <span className="ml-2">{editMode.preferences ? 'Cancel' : 'Edit'}</span>
            </Button>
          </div>

          {editMode.preferences ? (
            <div className="space-y-6">
              <div>
                <Label className="mb-2 block">Intended Majors</Label>
                <div className="flex flex-wrap gap-2">
                  {MAJORS.map(major => (
                    <button
                      key={major}
                      onClick={() => toggleArrayValue('intended_majors', major)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all
                        ${formData.intended_majors?.includes(major) 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {major}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Preferred Countries</Label>
                <div className="flex flex-wrap gap-2">
                  {COUNTRIES.map(country => (
                    <button
                      key={country}
                      onClick={() => toggleArrayValue('preferred_countries', country)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all
                        ${formData.preferred_countries?.includes(country) 
                          ? 'bg-green-600 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {country}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Budget Min ($/year)</Label>
                  <Input 
                    type="number"
                    min="0"
                    value={formData.budget_min} 
                    onChange={(e) => updateFormField('budget_min', e.target.value)}
                    className="mt-1" 
                    placeholder="e.g., 20000"
                  />
                </div>
                <div>
                  <Label>Budget Max ($/year)</Label>
                  <Input 
                    type="number"
                    min="0"
                    value={formData.budget_max} 
                    onChange={(e) => updateFormField('budget_max', e.target.value)}
                    className="mt-1" 
                    placeholder="e.g., 60000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>College Size</Label>
                  <select
                    value={formData.preferred_college_size}
                    onChange={(e) => updateFormField('preferred_college_size', e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Any</option>
                    {['Small', 'Medium', 'Large'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Campus Setting</Label>
                  <select
                    value={formData.preferred_setting}
                    onChange={(e) => updateFormField('preferred_setting', e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Any</option>
                    {['Urban', 'Suburban', 'Rural'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={savePreferences} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Save size={16} className="mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-gray-500 text-sm">Intended Majors</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(profileData?.profile?.intendedMajors || profileData?.profile?.intended_majors || []).length > 0 ? (
                    (profileData?.profile?.intendedMajors || profileData?.profile?.intended_majors || []).map((major: string) => (
                      <span key={major} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                        {major}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500 text-sm">Not set</span>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-gray-500 text-sm">Preferred Countries</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(profileData?.profile?.preferredCountries || profileData?.profile?.preferred_countries || []).length > 0 ? (
                    (profileData?.profile?.preferredCountries || profileData?.profile?.preferred_countries || []).map((country: string) => (
                      <span key={country} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                        {country}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500 text-sm">Not set</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Activities */}
        <div 
          ref={(el) => { sectionRefs.current.activities = el; }}
          id="activities"
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Trophy className="text-yellow-600" size={24} />
              <h2 className="text-xl font-bold text-gray-900">Extracurricular Activities</h2>
            </div>
          </div>

          {/* Activity List */}
          <div className="space-y-3 mb-6">
            {profileData?.activities && profileData.activities.length > 0 ? (
              profileData.activities.map((activity: any) => (
                <div key={activity.id} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{activity.activity_name}</span>
                      <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">
                        {activity.activity_type}
                      </span>
                    </div>
                    {activity.position_title && (
                      <p className="text-sm text-gray-600 mt-1">{activity.position_title}</p>
                    )}
                    {activity.description && (
                      <p className="text-sm text-gray-500 mt-1">{activity.description}</p>
                    )}
                    {(activity.hours_per_week || activity.weeks_per_year) && (
                      <p className="text-xs text-gray-400 mt-2">
                        {activity.hours_per_week} hrs/week • {activity.weeks_per_year} weeks/year
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteActivity(activity.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    disabled={saving}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No activities added yet</p>
            )}
          </div>

          {/* Add Activity Form */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <Plus size={18} />
              Add New Activity
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Activity Name *</Label>
                  <Input 
                    value={newActivity.activity_name} 
                    onChange={(e) => setNewActivity((prev: typeof newActivity) => ({ ...prev, activity_name: e.target.value }))}
                    className="mt-1" 
                    placeholder="e.g., Debate Club"
                  />
                </div>
                <div>
                  <Label>Activity Type *</Label>
                  <select
                    value={newActivity.activity_type}
                    onChange={(e) => setNewActivity((prev: typeof newActivity) => ({ ...prev, activity_type: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select type</option>
                    {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label>Position/Role</Label>
                <Input 
                  value={newActivity.position_title} 
                  onChange={(e) => setNewActivity((prev: typeof newActivity) => ({ ...prev, position_title: e.target.value }))}
                  className="mt-1" 
                  placeholder="e.g., President"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input 
                  value={newActivity.description} 
                  onChange={(e) => setNewActivity((prev: typeof newActivity) => ({ ...prev, description: e.target.value }))}
                  className="mt-1" 
                  placeholder="Brief description (max 150 chars)"
                  maxLength={150}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Hours/Week</Label>
                  <Input 
                    type="number"
                    min="0"
                    max="40"
                    value={newActivity.hours_per_week} 
                    onChange={(e) => setNewActivity((prev: typeof newActivity) => ({ ...prev, hours_per_week: e.target.value }))}
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label>Weeks/Year</Label>
                  <Input 
                    type="number"
                    min="0"
                    max="52"
                    value={newActivity.weeks_per_year} 
                    onChange={(e) => setNewActivity((prev: typeof newActivity) => ({ ...prev, weeks_per_year: e.target.value }))}
                    className="mt-1" 
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={addActivity} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Plus size={16} className="mr-2" />
                  Add Activity
                </Button>
              </div>
            </div>
          </div>
        </div>
        </div> {/* End of Main Content flex-1 */}
      </div> {/* End of Navigation + Content flex container */}
    </div>
  );
};

export default Settings;