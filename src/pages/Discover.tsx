// src/pages/Discover.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

/* ---------- Types ---------- */

type Classification = 'REACH' | 'TARGET' | 'SAFETY';

interface College {
  id: number;
  name: string;
  country: string;
  location: string;
  acceptance_rate?: number;
}

interface FinancialFit {
  total_per_year: number;
  within_budget: boolean;
  aid_available: boolean;
}

interface Recommendation {
  college: College;
  classification: Classification;
  eligibility: {
    status: 'eligible' | 'conditional' | 'not_eligible';
  };
  financial_fit: FinancialFit;
  overall_fit_score: number;
  why_recommended: string[];
  concerns: string[];
}

interface Profile {
  academic_board: string;
  percentage?: number;
  max_budget_per_year: number;
  intended_major: string;
  target_countries: string[];
}

/* ---------- Component ---------- */

const Discover: React.FC = () => {
  const navigate = useNavigate();

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const load = async () => {
      const profileRes = await api.profile.get<{ data: Profile }>();
      const recRes = await api.recommendations.get<{ data: Recommendation[] }>();

      setProfile(profileRes.data);
      setRecommendations(recRes.data);
      setLoading(false);
    };

    load().catch(() => navigate('/onboarding'));
  }, [navigate]);

  const handleAddCollege = async (collegeId: number) => {
    await api.applications.create({ college_id: collegeId, application_type: 'regular' });
    alert('College added');
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Recommendations</h1>

      {recommendations.map(r => (
        <div
          key={r.college.id}
          className="bg-white border-l-4 p-4 mb-4 shadow"
        >
          <h2 className="font-semibold">{r.college.name}</h2>
          <p>{r.college.country}</p>
          <p>₹{(r.financial_fit.total_per_year / 100000).toFixed(1)}L</p>

          <button
            onClick={() => handleAddCollege(r.college.id)}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
          >
            Add College
          </button>
        </div>
      ))}
    </div>
  );
};

export default Discover;
