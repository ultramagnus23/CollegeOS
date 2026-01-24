import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft } from 'lucide-react';
import api from '../services/api';

const AddCollege: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    country: '',
    location: '',
    officialWebsite: '',
    admissionsUrl: '',
    programsUrl: '',
    majorCategories: '',
    academicStrengths: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validation
    if (!formData.name || !formData.country || !formData.officialWebsite) {
      setError('Name, country, and official website are required');
      return;
    }

    try {
      setLoading(true);

      // Parse comma-separated values into arrays
      const data = {
        name: formData.name.trim(),
        country: formData.country.trim(),
        location: formData.location.trim() || undefined,
        officialWebsite: formData.officialWebsite.trim(),
        admissionsUrl: formData.admissionsUrl.trim() || undefined,
        programsUrl: formData.programsUrl.trim() || undefined,
        majorCategories: formData.majorCategories
          ? formData.majorCategories.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        academicStrengths: formData.academicStrengths
          ? formData.academicStrengths.split(',').map(s => s.trim()).filter(Boolean)
          : []
      };

      const response = await api.colleges.create(data);

      if (response.success) {
        setSuccess(true);
        // Reset form
        setFormData({
          name: '',
          country: '',
          location: '',
          officialWebsite: '',
          admissionsUrl: '',
          programsUrl: '',
          majorCategories: '',
          academicStrengths: ''
        });
        
        // Redirect after 2 seconds
        setTimeout(() => {
          navigate('/colleges');
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add college. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>

        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
            <Plus className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Add New College</h1>
              <p className="text-sm text-gray-600">
                Contribute to our database by adding colleges not yet listed
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
              College added successfully! Redirecting to colleges list...
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                College Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Massachusetts Institute of Technology"
                className="w-full border rounded-lg px-4 py-2"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Country <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="country"
                  value={formData.country}
                  onChange={handleChange}
                  placeholder="e.g., United States"
                  className="w-full border rounded-lg px-4 py-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location (City, State)
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="e.g., Cambridge, MA"
                  className="w-full border rounded-lg px-4 py-2"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Official Website <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                name="officialWebsite"
                value={formData.officialWebsite}
                onChange={handleChange}
                placeholder="e.g., https://www.mit.edu"
                className="w-full border rounded-lg px-4 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Admissions Page URL
              </label>
              <input
                type="url"
                name="admissionsUrl"
                value={formData.admissionsUrl}
                onChange={handleChange}
                placeholder="e.g., https://www.mit.edu/admissions"
                className="w-full border rounded-lg px-4 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Programs Page URL
              </label>
              <input
                type="url"
                name="programsUrl"
                value={formData.programsUrl}
                onChange={handleChange}
                placeholder="e.g., https://www.mit.edu/academics"
                className="w-full border rounded-lg px-4 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Major Categories (comma-separated)
              </label>
              <input
                type="text"
                name="majorCategories"
                value={formData.majorCategories}
                onChange={handleChange}
                placeholder="e.g., Engineering, Computer Science, Physics"
                className="w-full border rounded-lg px-4 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                Separate multiple categories with commas
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Academic Strengths (comma-separated)
              </label>
              <textarea
                name="academicStrengths"
                value={formData.academicStrengths}
                onChange={handleChange}
                placeholder="e.g., Research, Innovation, STEM Excellence"
                className="w-full border rounded-lg px-4 py-2"
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1">
                Separate multiple strengths with commas
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Adding College...' : 'Add College'}
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddCollege;
