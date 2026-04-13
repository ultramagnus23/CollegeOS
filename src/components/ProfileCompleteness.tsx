import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { profileService } from '@/services/profileService';
import { Progress } from '@/components/ui/progress';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';

interface CompletionItem {
  label: string;
  done: boolean;
  href?: string;
}

// Section navigation map for backend-supplied missing field labels
const FIELD_HREF_MAP: Record<string, string> = {
  'First Name': '/settings#basic', 'Email': '/settings#basic', 'Country': '/settings#basic',
  'Phone Number': '/settings#basic', 'Date of Birth': '/settings#basic', 'School Name': '/settings#basic',
  'Curriculum Type': '/settings#academic', 'Graduation Year': '/settings#academic', 'Subjects': '/settings#academic',
  'GPA (Weighted)': '/settings#academic', 'GPA (Unweighted)': '/settings#academic',
  'SAT Score': '/settings#test-scores', 'ACT Score': '/settings#test-scores',
  'IELTS Score': '/settings#test-scores', 'TOEFL Score': '/settings#test-scores',
  'College Size Preference': '/settings#preferences', 'Campus Setting Preference': '/settings#preferences',
  'Activities': '/settings#activities',
};

const parseJsonArray = (value?: string | string[]) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value) as string[]; } catch { return []; }
};

export default function ProfileCompleteness() {
  const { user } = useAuth();
  const profile = profileService.getProfile();
  const { completionPercent, completedFields, missingFields } = useProfileCompletion();

  // Build navigation items by merging backend data with local fallback labels
  const items = useMemo<CompletionItem[]>(() => {
    // When backend data is available, use it
    if (completedFields.length > 0 || missingFields.length > 0) {
      const allLabels = [...completedFields, ...missingFields];
      return allLabels.map(label => ({
        label,
        done: completedFields.includes(label),
        href: FIELD_HREF_MAP[label],
      }));
    }

    // Fallback to local calculation while backend data loads
    const targetCountries = parseJsonArray(user?.target_countries ?? profile?.target_countries ?? profile?.preferredCountries);
    const intendedMajors = parseJsonArray(user?.intended_majors ?? profile?.intended_majors ?? profile?.potentialMajors);
    const testStatus = typeof user?.test_status === 'string'
      ? (() => { try { return JSON.parse(user.test_status); } catch { return {}; } })()
      : user?.test_status;
    const gpa = profile?.gpa ?? profile?.currentGPA ?? profile?.percentage ?? null;
    const sat = profile?.satScore ?? testStatus?.sat_score ?? profile?.test_status?.satScore ?? null;
    const act = profile?.actScore ?? testStatus?.act_score ?? profile?.test_status?.actScore ?? null;
    const activities = Array.isArray(profile?.activities) ? profile?.activities : [];

    return [
      { label: 'Full name', done: Boolean(user?.full_name), href: '/settings#basic' },
      { label: 'GPA / percentage', done: Boolean(gpa), href: '/settings#academic' },
      { label: 'Test scores', done: Boolean(sat || act), href: '/settings#test-scores' },
      { label: 'Intended major', done: intendedMajors.length > 0, href: '/settings#preferences' },
      { label: 'Target countries', done: targetCountries.length > 0, href: '/settings#preferences' },
      { label: 'Extracurriculars', done: activities.length > 0, href: '/settings#activities' },
      { label: 'Nationality (India)', done: Boolean(user?.country), href: '/settings#basic' },
    ];
  }, [completedFields, missingFields, profile, user]);

  const percentage = completionPercent;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Profile completeness</h3>
          {percentage < 60 && (
            <p className="text-xs text-muted-foreground">Complete your profile to get accurate chancing results.</p>
          )}
        </div>
        <span className="text-lg font-bold text-foreground">{percentage}%</span>
      </div>
      <Progress value={percentage} className="h-2" />
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {item.done ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground" />
              )}
              <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>
                {item.label}
              </span>
            </div>
            {!item.done && item.href && (
              <Link to={item.href} className="text-xs text-primary hover:underline">
                Add →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
