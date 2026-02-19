// FILE: src/App.tsx
import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./layouts/DashboardLayout";
import { profileService } from "./services/profileService";

// Page Imports
import AuthPage from "./pages/Auth";
import OnboardingPage from "./pages/Onboarding"; // Make sure this matches your file name
import IntelligentCollegeSearch from './pages/IntelligentCollegeSearch';

// Dashboard Pages
import Dashboard from "./pages/Dashboard";
import Discover from "./pages/Discover";
import Colleges from "./pages/Colleges";
import CollegeDetails from "./pages/CollegeDetails";
import Research from "./pages/Research";
import Applications from "./pages/Applications";
import Requirements from "./pages/Requirements";
import Deadlines from "./pages/Deadlines";
import Essays from "./pages/Essays";
import Settings from "./pages/Settings";
import Activities from "./pages/Activities";
import Documents from "./pages/Documents";
import Scholarships from "./pages/Scholarships";
import Recommendations from "./pages/Recommendations";
import { Timeline } from "./pages/Timeline";

// FIXED: Import the type from the new types.ts file
import { StudentProfile } from "./types";

const queryClient = new QueryClient();

const AppContent = () => {
  const { completeOnboarding } = useAuth();
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);

  useEffect(() => {
    // Load profile from ProfileService on mount
    const profile = profileService.getProfile();
    if (profile) {
      // Map to StudentProfile format for backward compatibility
      setStudentProfile(profile as any);
    }
  }, []);

  const handleOnboardingComplete = async (profile: StudentProfile) => {
    try {
      // Map the profile data to the format expected by the backend
      const onboardingData = {
        targetCountries: profile.preferredCountries,
        intendedMajors: profile.potentialMajors,
        testStatus: {
          satScore: profile.satScore || null,
          actScore: profile.actScore || null,
          ibPredicted: profile.ibPredicted || null,
        },
        languagePreferences: [], // Can be expanded later if needed
      };

      // Complete onboarding via AuthContext (this automatically updates ProfileService)
      await completeOnboarding(onboardingData);
      
      // Update local state for backward compatibility
      setStudentProfile(profile);
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      // You might want to show an error message to the user here
    }
  };

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />

      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />

          <Route
            path="/onboarding"
            element={
              <ProtectedRoute requireOnboarding={false}>
                {/* FIXED: Passed the missing 'onComplete' prop here */}
                <OnboardingPage onComplete={handleOnboardingComplete} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="discover" element={<Discover />} />
            <Route path="colleges" element={<Colleges />} />
            <Route path="colleges/:id" element={<CollegeDetails />} />
            <Route path="research" element={<Research />} />
            <Route path="applications" element={<Applications />} />
            <Route path="requirements" element={<Requirements />} />
            <Route path="deadlines" element={<Deadlines />} />
            <Route path="essays" element={<Essays />} />
            <Route path="activities" element={<Activities />} />
            <Route path="documents" element={<Documents />} />
            <Route path="scholarships" element={<Scholarships />} />
            <Route path="recommendations" element={<Recommendations />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="settings" element={<Settings />} />

            <Route
              path="/search"
              element={
                <IntelligentCollegeSearch
                  studentProfile={studentProfile}
                />
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;