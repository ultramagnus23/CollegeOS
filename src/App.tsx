// FILE: src/App.tsx
import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./layouts/DashboardLayout";
import { profileService } from "./services/profileService";
import { api } from "./services/api";

// Page Imports
import AuthPage from "./pages/Auth";
import OnboardingPage from "./pages/Onboarding"; // Make sure this matches your file name

// Dashboard Pages
import Dashboard from "./pages/Dashboard";
import Colleges from "./pages/Colleges";
import CollegeDetails from "./pages/CollegeDetails";
import Research from "./pages/Research";
import Applications from "./pages/Applications";
import Requirements from "./pages/Requirements";
import Deadlines from "./pages/Deadlines";
import Essays from "./pages/Essays";
import Settings from "./pages/Settings";
import Documents from "./pages/Documents";
import Scholarships from "./pages/Scholarships";
import Recommendations from "./pages/Recommendations";
import { Timeline } from "./pages/Timeline";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";

// FIXED: Import the type from the types directory
import { StudentProfile } from "./types/index";

const queryClient = new QueryClient();

const AppContent = () => {
  const { completeOnboarding, refreshUser } = useAuth();
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);

  useEffect(() => {
    // Load profile from backend (with localStorage fallback) on mount
    profileService.getProfileFromBackend().then(profile => {
      if (profile) {
        setStudentProfile(profile as any);
      }
    }).catch(err => {
      console.error('Failed to load profile on init:', err);
    });
  }, []);

  const handleOnboardingComplete = async (profile: StudentProfile) => {
    try {
      // All heavy lifting (saveExtendedProfile, completeOnboarding, getInstantRecommendations)
      // is now done inside Onboarding.tsx's LoadingSequence onDone handler.
      // Here we just refresh the user session and save any activities.
      await refreshUser();
      if (profile.activities && Array.isArray(profile.activities)) {
        for (const activity of profile.activities) {
          try { await api.addActivity(activity); } catch { /* non-critical */ }
        }
      }
      setStudentProfile(profile);
    } catch (error) {
      console.error('Failed to refresh after onboarding:', error);
    }
  };

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />

      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/terms" element={<Terms />} />

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
            <Route path="discover" element={<Navigate to="/colleges" replace />} />
            <Route path="colleges" element={<Colleges />} />
            <Route path="colleges/:id" element={<CollegeDetails />} />
            <Route path="research" element={<Research />} />
            <Route path="applications" element={<Applications />} />
            <Route path="requirements" element={<Requirements />} />
            <Route path="deadlines" element={<Deadlines />} />
            <Route path="essays" element={<Essays />} />
            <Route path="activities" element={<Navigate to="/settings" replace />} />
            <Route path="documents" element={<Documents />} />
            <Route path="scholarships" element={<Scholarships />} />
            <Route path="recommendations" element={<Recommendations />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
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