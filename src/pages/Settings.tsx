import { useAuth, User } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User as UserIcon, Globe, BookOpen, TestTube } from 'lucide-react';

const Settings = () => {
  const { user } = useAuth();

  // Safe JSON parsing helper with proper typing
  const safeParseJSON = <T,>(jsonString: string | undefined, fallback: T): T => {
    if (!jsonString) return fallback;
    try {
      return JSON.parse(jsonString) as T;
    } catch {
      return fallback;
    }
  };

  // Parse user data safely
  const targetCountries = safeParseJSON<string[]>(user?.target_countries, []);
  const intendedMajors = safeParseJSON<string[]>(user?.intended_majors, []);
  const testStatus = safeParseJSON<Record<string, { taken: boolean; score?: number }>>(user?.test_status, {});
  const languagePreferences = safeParseJSON<string[]>(user?.language_preferences, []);

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600">Manage your account and preferences</p>
      </div>

      <div className="space-y-6">
        {/* Profile Information */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <UserIcon className="text-blue-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Profile Information</h2>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input value={user?.full_name || ''} disabled className="mt-1" />
            </div>

            <div>
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="mt-1" />
            </div>

            <div>
              <Label>Country</Label>
              <Input value={user?.country || ''} disabled className="mt-1" />
            </div>
          </div>
        </div>

        {/* Academic Profile */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <BookOpen className="text-green-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Academic Profile</h2>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Target Countries</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {targetCountries.length > 0 ? (
                  targetCountries.map((country: string) => (
                    <span key={country} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                      {country}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-500">No target countries set</span>
                )}
              </div>
            </div>

            <div>
              <Label>Intended Majors</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {intendedMajors.length > 0 ? (
                  intendedMajors.map((major: string) => (
                    <span key={major} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      {major}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-500">No intended majors set</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Test Scores */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <TestTube className="text-purple-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Test Scores</h2>
          </div>

          <div className="space-y-4">
            {Object.keys(testStatus).length > 0 ? (
              Object.entries(testStatus).map(([test, data]) => (
                <div key={test} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <span className="font-medium text-gray-900 uppercase">{test}</span>
                  {data.taken ? (
                    <span className="text-green-600 font-medium">
                      {data.score ? `Score: ${data.score}` : 'Taken'}
                    </span>
                  ) : (
                    <span className="text-gray-500">Not taken</span>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No test scores recorded</p>
            )}
          </div>
        </div>

        {/* Language Preferences */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Globe className="text-orange-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Language Preferences</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {languagePreferences.length > 0 ? (
              languagePreferences.map((lang: string) => (
                <span key={lang} className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                  {lang}
                </span>
              ))
            ) : (
              <span className="text-sm text-gray-500">No language preferences set</span>
            )}
          </div>
        </div>

        {/* Account Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Account Actions</h2>
          <div className="space-y-3">
            <Button variant="outline" className="w-full justify-start" disabled>
              Change Password (Coming Soon)
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled>
              Update Academic Profile (Coming Soon)
            </Button>
            <Button variant="destructive" className="w-full justify-start" disabled>
              Delete Account (Coming Soon)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;