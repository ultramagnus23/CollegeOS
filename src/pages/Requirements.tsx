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

      // Build requirements for each application
      const requirements: CollegeRequirements[] = applications.map((app: any) => {
        const collegeId = app.college_id;
        
        // Generate standard application requirements
        const applicationReqs: Requirement[] = [
          { id: `${collegeId}-app-1`, text: 'Common Application or Coalition App', completed: false, category: 'application' },
          { id: `${collegeId}-app-2`, text: 'Application fee', completed: false, category: 'application' },
          { id: `${collegeId}-app-3`, text: 'High school transcript', completed: false, category: 'application' },
          { id: `${collegeId}-app-4`, text: 'Counselor recommendation', completed: false, category: 'application' },
          { id: `${collegeId}-app-5`, text: 'Teacher recommendations (2)', completed: false, category: 'application' },
          { id: `${collegeId}-app-6`, text: 'SAT/ACT scores (if required)', completed: false, category: 'application' },
          { id: `${collegeId}-app-7`, text: 'Common App essay (650 words)', completed: false, category: 'application' },
          { id: `${collegeId}-app-8`, text: 'Supplemental essays', completed: false, category: 'application' },
          { id: `${collegeId}-app-9`, text: 'CSS Profile (for financial aid)', completed: false, category: 'application' },
          { id: `${collegeId}-app-10`, text: 'FAFSA (for financial aid)', completed: false, category: 'application' },
        ];

        // Generate academic requirements
        const academicReqs: Requirement[] = [
          { id: `${collegeId}-acad-1`, text: 'GPA: 3.5+ recommended', completed: false, category: 'academic' },
          { id: `${collegeId}-acad-2`, text: 'SAT: 1400-1550 (middle 50%)', completed: false, category: 'academic' },
          { id: `${collegeId}-acad-3`, text: 'ACT: 31-34 (middle 50%)', completed: false, category: 'academic' },
          { id: `${collegeId}-acad-4`, text: '4 years English', completed: false, category: 'academic' },
          { id: `${collegeId}-acad-5`, text: '3-4 years Math', completed: false, category: 'academic' },
          { id: `${collegeId}-acad-6`, text: '2-3 years Science', completed: false, category: 'academic' },
          { id: `${collegeId}-acad-7`, text: '2-3 years Social Studies', completed: false, category: 'academic' },
          { id: `${collegeId}-acad-8`, text: '2-4 years Foreign Language', completed: false, category: 'academic' },
        ];

        // Generate deadline requirements
        const deadlineReqs: Requirement[] = [
          { id: `${collegeId}-dl-1`, text: 'Early Action: November 1', completed: false, category: 'deadline' },
          { id: `${collegeId}-dl-2`, text: 'Early Decision: November 15', completed: false, category: 'deadline' },
          { id: `${collegeId}-dl-3`, text: 'Regular Decision: January 1', completed: false, category: 'deadline' },
          { id: `${collegeId}-dl-4`, text: 'Financial Aid Priority: February 1', completed: false, category: 'deadline' },
        ];

        return {
          college_id: collegeId,
          college_name: app.college_name,
          country: app.country || 'Unknown',
          requirements: {
            application: applicationReqs,
            academic: academicReqs,
            deadlines: deadlineReqs,
          },
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
        <div className="flex items-center gap-2 mb-2 text-gray-700">
          {icon}
          <span className="font-medium">{title}</span>
          <span className="text-xs text-gray-500">
            ({completedCount}/{totalCount} completed)
          </span>
        </div>
        <div className="space-y-2 ml-6">
          {filteredReqs.map(req => (
            <div 
              key={req.id} 
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
              onClick={() => toggleRequirement(req.id)}
            >
              <Checkbox 
                checked={completionData[req.id] || false}
                className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500 pointer-events-none"
              />
              <span className={`text-sm ${completionData[req.id] ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <ClipboardList className="text-purple-600" size={32} />
          Application Requirements
        </h1>
        <p className="text-gray-600">Track what each college requires from your application</p>
      </div>

      {/* Overall Progress */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Overall Progress</h2>
          <span className="text-2xl font-bold text-purple-600">{getOverallProgress()}%</span>
        </div>
        <Progress value={getOverallProgress()} className="h-3" />
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>{collegeRequirements.length} colleges in your list</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <CheckCircle className="text-green-500" size={16} />
              Completed
            </span>
            <span className="flex items-center gap-1">
              <Circle className="text-gray-300" size={16} />
              Pending
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-gray-500" />
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
          <span className="text-sm text-gray-600">Show incomplete only</span>
        </label>
      </div>

      {/* College Requirements List */}
      {filteredColleges.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
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
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                {/* College Header */}
                <div 
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleCollege(college.college_id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="text-gray-400" size={20} />
                    ) : (
                      <ChevronRight className="text-gray-400" size={20} />
                    )}
                    <div>
                      <h3 className="font-bold text-gray-900">{college.college_name}</h3>
                      <span className="text-sm text-gray-500">{college.country}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-32">
                      <Progress value={progress} className="h-2" />
                    </div>
                    <span className={`text-sm font-medium ${progress === 100 ? 'text-green-600' : 'text-gray-600'}`}>
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
                      <FileText className="text-blue-500" size={18} />
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
