// src/pages/Activities.tsx
// Page for managing extracurricular activities

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ActivityManager from '@/components/activities/ActivityManager';

export default function Activities() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">Extracurricular Activities</h1>
          <p className="text-gray-600 mt-2">
            Track your activities in Common App format. You can add up to 10 activities.
            Activities are ranked by tier (1 = National/International, 4 = Participation).
          </p>
        </div>

        {/* Activity Manager Component */}
        <ActivityManager />
      </div>
    </div>
  );
}
