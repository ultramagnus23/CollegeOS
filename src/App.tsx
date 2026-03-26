// FILE: src/App.tsx
import React, { useState, useEffect, Component, ReactNode } from "react";
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
import { api } from "./services/api";

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
import NotificationsPage from "./pages/Notifications";

// FIXED: Import the type from the new types.ts file
import { StudentProfile } from "./types";

const queryClient = new QueryClient();

// ---------------------------------------------------------------------------
// Top-level error boundary — prevents a blank screen when an unhandled render
// error occurs anywhere in the tree.
// ---------------------------------------------------------------------------
interface ErrorBoundaryState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'sans-serif' }}>
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>Something went wrong</h1>
            <p style={{ color: '#666', marginBottom: '1rem', wordBreak: 'break-word' }}>{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #ccc', cursor: 'pointer' }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent = () => {
  const { completeOnboarding, refreshUser } = useAuth();
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
            <Route path="notifications" element={<NotificationsPage />} />
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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;