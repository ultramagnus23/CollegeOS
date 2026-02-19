import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ClipboardList, 
  ChevronDown, 
  ChevronRight,
  GraduationCap,
  FileText,
  Calendar,
  Filter,
  CheckCircle,
  Circle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface Requirement {
  id: string;
  text: string;
  completed: boolean;
  category: 'application' | 'academic' | 'deadline';
}

interface CollegeRequirements {
  college_id: number;
  college_name: string;
  country: string;
  requirements: {
    application: Requirement[];
    academic: Requirement[];
    deadlines: Requirement[];
  };
  progress: number;
}

const Requirements = () => {
  const navigate = useNavigate();
  const [collegeRequirements, setCollegeRequirements] = useState<CollegeRequirements[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedColleges, setExpandedColleges] = useState<Set<number>>(new Set());
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [completionData, setCompletionData] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadRequirements();
  }, []);

  // Load saved completion data from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('requirementsCompletion');
    if (saved) {
      try {
        setCompletionData(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved completion data:', e);
      }
    }
  }, []);

  // Save completion data to localStorage
  const saveCompletionData = (data: Record<string, boolean>) => {
    localStorage.setItem('requirementsCompletion', JSON.stringify(data));
  };

  // Country-specific requirement generators
  const getCountryRequirements = (collegeId: number, country: string, collegeName: string) => {
    const countryLower = country?.toLowerCase() || '';
    
    // USA requirements
    if (countryLower === 'united states' || countryLower === 'usa' || countryLower === 'us') {
      return {
        application: [
          { id: `${collegeId}-app-1`, text: 'Common Application or Coalition App', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-2`, text: 'Application fee', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-3`, text: 'High school transcript', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-4`, text: 'Counselor recommendation', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-5`, text: 'Teacher recommendations (2)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-6`, text: 'SAT/ACT scores (if required)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-7`, text: 'Common App essay (650 words)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-8`, text: 'Supplemental essays', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-9`, text: 'CSS Profile (for financial aid)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-10`, text: 'FAFSA (for financial aid)', completed: false, category: 'application' as const },
        ],
        academic: [
          { id: `${collegeId}-acad-1`, text: 'GPA: 3.5+ recommended', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-2`, text: 'SAT: 1400-1550 (middle 50%)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-3`, text: 'ACT: 31-34 (middle 50%)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-4`, text: '4 years English', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-5`, text: '3-4 years Math', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-6`, text: '2-3 years Science', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-7`, text: '2-3 years Social Studies', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-8`, text: '2-4 years Foreign Language', completed: false, category: 'academic' as const },
        ],
        deadlines: [
          { id: `${collegeId}-dl-1`, text: 'Early Action: November 1', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-2`, text: 'Early Decision: November 15', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-3`, text: 'Regular Decision: January 1', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-4`, text: 'Financial Aid Priority: February 1', completed: false, category: 'deadline' as const },
        ],
      };
    }
    
    // UK requirements
    if (countryLower === 'united kingdom' || countryLower === 'uk' || countryLower.includes('england') || 
        countryLower.includes('scotland') || countryLower.includes('wales')) {
      return {
        application: [
          { id: `${collegeId}-app-1`, text: 'UCAS Application (max 5 choices)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-2`, text: 'UCAS Fee payment', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-3`, text: 'Personal Statement (4,000 characters max)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-4`, text: 'Academic reference from teacher/counselor', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-5`, text: 'Predicted grades from school', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-6`, text: 'English language test (IELTS/TOEFL for international students)', completed: false, category: 'application' as const },
        ],
        academic: [
          { id: `${collegeId}-acad-1`, text: 'A-Level requirements (typically AAA-A*A*A)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-2`, text: 'IB Diploma (typically 36-42 points)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-3`, text: 'GCSE English and Maths (grade 6+)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-4`, text: 'Subject-specific requirements for course', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-5`, text: 'IELTS 6.5-7.5 (for non-native speakers)', completed: false, category: 'academic' as const },
        ],
        deadlines: [
          { id: `${collegeId}-dl-1`, text: 'Oxford/Cambridge: October 15', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-2`, text: 'Medicine/Dentistry/Veterinary: October 15', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-3`, text: 'Other courses: January 31', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-4`, text: 'International deadline: June 30', completed: false, category: 'deadline' as const },
        ],
      };
    }
    
    // Germany requirements
    if (countryLower === 'germany' || countryLower === 'deutschland') {
      return {
        application: [
          { id: `${collegeId}-app-1`, text: 'Uni-Assist application (for international students)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-2`, text: 'Hochschulstart application (for restricted programs)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-3`, text: 'Certified translated transcripts', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-4`, text: 'Motivation letter (Motivationsschreiben)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-5`, text: 'CV/Resume (Lebenslauf)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-6`, text: 'Language proficiency certificate', completed: false, category: 'application' as const },
        ],
        academic: [
          { id: `${collegeId}-acad-1`, text: 'Abitur equivalent qualification', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-2`, text: 'German language: DSH-2 or TestDaF 4x4 (for German-taught programs)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-3`, text: 'English: IELTS 6.5+ or TOEFL 90+ (for English-taught programs)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-4`, text: 'Subject-specific requirements (Numerus Clausus)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-5`, text: 'Foundation course (Studienkolleg) if needed', completed: false, category: 'academic' as const },
        ],
        deadlines: [
          { id: `${collegeId}-dl-1`, text: 'Winter semester: July 15', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-2`, text: 'Summer semester: January 15', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-3`, text: 'NC programs may have earlier deadlines', completed: false, category: 'deadline' as const },
        ],
      };
    }
    
    // India requirements
    if (countryLower === 'india') {
      return {
        application: [
          { id: `${collegeId}-app-1`, text: 'Direct university application portal', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-2`, text: 'Class 12 mark sheets (certified copy)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-3`, text: 'Class 10 mark sheets (certified copy)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-4`, text: 'Entrance exam admit card/scorecard', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-5`, text: 'Category certificate (if applicable)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-6`, text: 'Domicile certificate (if applicable)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-7`, text: 'Passport size photographs', completed: false, category: 'application' as const },
        ],
        academic: [
          { id: `${collegeId}-acad-1`, text: 'JEE Main/Advanced (for engineering at IITs/NITs)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-2`, text: 'NEET (for medicine)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-3`, text: 'CUET (for central universities)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-4`, text: 'Class 12 minimum 75% (general category)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-5`, text: 'PCM/PCB subjects required for technical/medical', completed: false, category: 'academic' as const },
        ],
        deadlines: [
          { id: `${collegeId}-dl-1`, text: 'JEE Main: January/April sessions', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-2`, text: 'JEE Advanced: May', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-3`, text: 'NEET: May', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-4`, text: 'Counselling rounds: June-August', completed: false, category: 'deadline' as const },
        ],
      };
    }
    
    // Canada requirements
    if (countryLower === 'canada') {
      return {
        application: [
          { id: `${collegeId}-app-1`, text: 'University online application', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-2`, text: 'OUAC application (for Ontario universities)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-3`, text: 'Official transcripts', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-4`, text: 'English proficiency (IELTS/TOEFL)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-5`, text: 'Supplementary application (if required)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-6`, text: 'Personal profile/essays', completed: false, category: 'application' as const },
        ],
        academic: [
          { id: `${collegeId}-acad-1`, text: 'High school diploma with required courses', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-2`, text: 'Minimum average 75-90% (varies by program)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-3`, text: 'IELTS 6.5+ or TOEFL 90+', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-4`, text: 'Program-specific prerequisites', completed: false, category: 'academic' as const },
        ],
        deadlines: [
          { id: `${collegeId}-dl-1`, text: 'Early admission: November-December', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-2`, text: 'Regular deadline: January-February', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-3`, text: 'Final deadline: March-April', completed: false, category: 'deadline' as const },
        ],
      };
    }
    
    // EU (General) - Netherlands, France, etc.
    if (countryLower === 'netherlands' || countryLower === 'france' || countryLower === 'spain' ||
        countryLower === 'italy' || countryLower === 'sweden' || countryLower === 'denmark' ||
        countryLower === 'belgium' || countryLower === 'austria' || countryLower === 'switzerland' ||
        countryLower === 'ireland' || countryLower === 'finland' || countryLower === 'norway' ||
        countryLower === 'portugal' || countryLower === 'poland') {
      return {
        application: [
          { id: `${collegeId}-app-1`, text: 'University direct application or Studielink (NL)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-2`, text: 'Certified/translated transcripts', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-3`, text: 'Motivation letter', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-4`, text: 'CV/Resume', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-5`, text: 'Letter of recommendation (if required)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-6`, text: 'Language proficiency certificate', completed: false, category: 'application' as const },
        ],
        academic: [
          { id: `${collegeId}-acad-1`, text: 'Secondary school diploma equivalent', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-2`, text: 'English: IELTS 6.0-7.0 or TOEFL 80-100', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-3`, text: 'Subject-specific requirements', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-4`, text: 'Numerus Fixus/Selection for competitive programs', completed: false, category: 'academic' as const },
        ],
        deadlines: [
          { id: `${collegeId}-dl-1`, text: 'Numerus Fixus programs: January 15', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-2`, text: 'Regular programs: May 1', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-3`, text: 'Non-EU students: Check specific deadlines', completed: false, category: 'deadline' as const },
        ],
      };
    }
    
    // Australia requirements
    if (countryLower === 'australia') {
      return {
        application: [
          { id: `${collegeId}-app-1`, text: 'University direct application or UAC', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-2`, text: 'Official academic transcripts', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-3`, text: 'English language test results', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-4`, text: 'Personal statement (if required)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-5`, text: 'Visa documentation (student visa 500)', completed: false, category: 'application' as const },
        ],
        academic: [
          { id: `${collegeId}-acad-1`, text: 'Year 12 or equivalent qualification', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-2`, text: 'ATAR equivalent score (varies by program)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-3`, text: 'IELTS 6.5+ or TOEFL 79+', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-4`, text: 'Subject prerequisites for course', completed: false, category: 'academic' as const },
        ],
        deadlines: [
          { id: `${collegeId}-dl-1`, text: 'Semester 1 (Feb start): October-December', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-2`, text: 'Semester 2 (Jul start): April-June', completed: false, category: 'deadline' as const },
        ],
      };
    }
    
    // Singapore requirements
    if (countryLower === 'singapore') {
      return {
        application: [
          { id: `${collegeId}-app-1`, text: 'University online application portal', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-2`, text: 'Official academic transcripts', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-3`, text: 'Personal statement/essays', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-4`, text: 'Letters of recommendation', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-5`, text: 'SAT/ACT scores (NUS/NTU)', completed: false, category: 'application' as const },
          { id: `${collegeId}-app-6`, text: 'Interview (if shortlisted)', completed: false, category: 'application' as const },
        ],
        academic: [
          { id: `${collegeId}-acad-1`, text: 'A-Level/IB/equivalent qualification', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-2`, text: 'SAT 1400+ or ACT 32+ (recommended)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-3`, text: 'English proficiency (if applicable)', completed: false, category: 'academic' as const },
          { id: `${collegeId}-acad-4`, text: 'Subject-specific requirements', completed: false, category: 'academic' as const },
        ],
        deadlines: [
          { id: `${collegeId}-dl-1`, text: 'Early admission (ABA): October-November', completed: false, category: 'deadline' as const },
          { id: `${collegeId}-dl-2`, text: 'Regular admission: February-March', completed: false, category: 'deadline' as const },
        ],
      };
    }
    
    // Default/Other countries - generic international requirements
    return {
      application: [
        { id: `${collegeId}-app-1`, text: `${collegeName} application portal`, completed: false, category: 'application' as const },
        { id: `${collegeId}-app-2`, text: 'Official academic transcripts (translated if needed)', completed: false, category: 'application' as const },
        { id: `${collegeId}-app-3`, text: 'Personal statement/motivation letter', completed: false, category: 'application' as const },
        { id: `${collegeId}-app-4`, text: 'Letters of recommendation', completed: false, category: 'application' as const },
        { id: `${collegeId}-app-5`, text: 'English language proficiency (IELTS/TOEFL)', completed: false, category: 'application' as const },
        { id: `${collegeId}-app-6`, text: 'Application fee payment', completed: false, category: 'application' as const },
      ],
      academic: [
        { id: `${collegeId}-acad-1`, text: 'Secondary school completion certificate', completed: false, category: 'academic' as const },
        { id: `${collegeId}-acad-2`, text: 'Minimum GPA/grade requirements', completed: false, category: 'academic' as const },
        { id: `${collegeId}-acad-3`, text: 'English proficiency test', completed: false, category: 'academic' as const },
        { id: `${collegeId}-acad-4`, text: 'Subject-specific prerequisites', completed: false, category: 'academic' as const },
      ],
      deadlines: [
        { id: `${collegeId}-dl-1`, text: 'Check university website for specific deadlines', completed: false, category: 'deadline' as const },
        { id: `${collegeId}-dl-2`, text: 'International student deadlines may differ', completed: false, category: 'deadline' as const },
      ],
    };
  };

  const loadRequirements = async () => {
    try {
      // Get user's applications first
      const applicationsResponse = await api.applications.get();
      const applications = applicationsResponse.data || [];
      
      if (applications.length === 0) {
        setCollegeRequirements([]);
        setLoading(false);
        return;
      }

      // Build requirements for each application based on country
      const requirements: CollegeRequirements[] = applications.map((app: any) => {
        const collegeId = app.college_id;
        const country = app.country || 'Unknown';
        const collegeName = app.college_name || 'University';
        
        // Get country-specific requirements
        const countryReqs = getCountryRequirements(collegeId, country, collegeName);

        return {
          college_id: collegeId,
          college_name: collegeName,
          country: country,
          requirements: countryReqs,
          progress: 0,
        };
      });

      setCollegeRequirements(requirements);
      // Expand all colleges by default
      setExpandedColleges(new Set(requirements.map(r => r.college_id)));
    } catch (error) {
      console.error('Failed to load requirements:', error);
      toast.error('Failed to load requirements');
    } finally {
      setLoading(false);
    }
  };

  const toggleCollege = (collegeId: number) => {
    setExpandedColleges(prev => {
      const newSet = new Set(prev);
      if (newSet.has(collegeId)) {
        newSet.delete(collegeId);
      } else {
        newSet.add(collegeId);
      }
      return newSet;
    });
  };

  const toggleRequirement = (requirementId: string) => {
    const newData = { ...completionData, [requirementId]: !completionData[requirementId] };
    setCompletionData(newData);
    saveCompletionData(newData);
  };

  const getCollegeProgress = (college: CollegeRequirements): number => {
    const allReqs = [
      ...college.requirements.application,
      ...college.requirements.academic,
      ...college.requirements.deadlines,
    ];
    const completedCount = allReqs.filter(r => completionData[r.id]).length;
    return allReqs.length > 0 ? Math.round((completedCount / allReqs.length) * 100) : 0;
  };

  const getOverallProgress = (): number => {
    if (collegeRequirements.length === 0) return 0;
    const totalProgress = collegeRequirements.reduce((sum, college) => sum + getCollegeProgress(college), 0);
    return Math.round(totalProgress / collegeRequirements.length);
  };

  const filteredColleges = collegeRequirements.filter(college => {
    if (selectedCountry && college.country !== selectedCountry) return false;
    return true;
  });

  const countries = [...new Set(collegeRequirements.map(c => c.country))];

  const renderRequirementList = (requirements: Requirement[], title: string, icon: React.ReactNode) => {
    const filteredReqs = showIncompleteOnly 
      ? requirements.filter(r => !completionData[r.id])
      : requirements;
    
    if (filteredReqs.length === 0) return null;

    // Always use original requirements array for the count display
    const completedCount = requirements.filter(r => completionData[r.id]).length;
    const totalCount = requirements.length;

    return (
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2 text-foreground">
          {icon}
          <span className="font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">
            ({completedCount}/{totalCount} completed)
          </span>
        </div>
        <div className="space-y-2 ml-6">
          {filteredReqs.map(req => (
            <div 
              key={req.id} 
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
              onClick={() => toggleRequirement(req.id)}
            >
              <Checkbox 
                checked={completionData[req.id] || false}
                className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500 pointer-events-none"
              />
              <span className={`text-sm ${completionData[req.id] ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {req.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-purple-600" size={40} />
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
          <ClipboardList className="text-purple-600" size={32} />
          Application Requirements
        </h1>
        <p className="text-muted-foreground">Track what each college requires from your application</p>
      </div>

      {/* Overall Progress */}
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">Overall Progress</h2>
          <span className="text-2xl font-bold text-purple-600">{getOverallProgress()}%</span>
        </div>
        <Progress value={getOverallProgress()} className="h-3" />
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>{collegeRequirements.length} colleges in your list</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <CheckCircle className="text-green-500" size={16} />
              Completed
            </span>
            <span className="flex items-center gap-1">
              <Circle className="text-muted-foreground/30" size={16} />
              Pending
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-muted-foreground" />
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            aria-label="Filter by country"
          >
            <option value="">All Countries</option>
            {countries.map(country => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox 
            checked={showIncompleteOnly}
            onCheckedChange={(checked) => setShowIncompleteOnly(checked as boolean)}
          />
          <span className="text-sm text-muted-foreground">Show incomplete only</span>
        </label>
      </div>

      {/* College Requirements List */}
      {filteredColleges.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <ClipboardList className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-500 mb-4">
            {collegeRequirements.length === 0 
              ? "You haven't added any colleges to your application list yet"
              : "No colleges match the selected filters"
            }
          </p>
          {collegeRequirements.length === 0 && (
            <Button onClick={() => navigate('/colleges')}>
              Browse Colleges
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredColleges.map(college => {
            const isExpanded = expandedColleges.has(college.college_id);
            const progress = getCollegeProgress(college);
            
            return (
              <div 
                key={college.college_id} 
                className="bg-card rounded-xl border border-border overflow-hidden"
              >
                {/* College Header */}
                <div 
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted"
                  onClick={() => toggleCollege(college.college_id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="text-muted-foreground" size={20} />
                    ) : (
                      <ChevronRight className="text-muted-foreground" size={20} />
                    )}
                    <div>
                      <h3 className="font-bold text-foreground">{college.college_name}</h3>
                      <span className="text-sm text-muted-foreground">{college.country}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-32">
                      <Progress value={progress} className="h-2" />
                    </div>
                    <span className={`text-sm font-medium ${progress === 100 ? 'text-success' : 'text-muted-foreground'}`}>
                      {progress}%
                    </span>
                  </div>
                </div>

                {/* Requirements Content */}
                {isExpanded && (
                  <div className="p-4 pt-0 border-t border-gray-100">
                    {renderRequirementList(
                      college.requirements.application,
                      'Application Requirements',
                      <FileText className="text-primary" size={18} />
                    )}
                    {renderRequirementList(
                      college.requirements.academic,
                      'Academic Requirements',
                      <GraduationCap className="text-purple-500" size={18} />
                    )}
                    {renderRequirementList(
                      college.requirements.deadlines,
                      'Deadlines',
                      <Calendar className="text-red-500" size={18} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Requirements;
