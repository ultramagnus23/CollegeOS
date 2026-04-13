// FILE: src/App.tsx
import React, { useState, useEffect, Component, ReactNode } from "react";
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
import { TutorialProvider, TutorialOverlay } from "./components/tutorial/TutorialOverlay";

// Pages
import AuthPage from "./pages/Auth";
import OnboardingPage from "./pages/Onboarding";

// Dashboard Pages
import Dashboard from "./pages/Dashboard";
import Colleges from "./pages/Colleges";
import CollegeDetails from "./pages/CollegeDetails";
import Applications from "./pages/Applications";
import Requirements from "./pages/Requirements";
import Deadlines from "./pages/Deadlines";
import Essays from "./pages/Essays";
import Settings from "./pages/Settings";
import Documents from "./pages/Documents";
import Scholarships from "./pages/Scholarships";
import Recommendations from "./pages/Recommendations";
import CollegeRecommendations from "./pages/CollegeRecommendations";
import { Timeline } from "./pages/Timeline";
import NotificationsPage from "./pages/Notifications";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/AdminDashboard";
import Landing from "./pages/Landing";
import Chancing from "./pages/Chancing";
// FinancialAid import removed — page merged into Scholarships; /financial-aid redirects to /scholarships

import { StudentProfile } from "./types/index";

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
  const { refreshUser, user } = useAuth();
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);

  useEffect(() => {
    profileService
      .getProfileFromBackend()
      .then((profile) => {
        if (profile) setStudentProfile(profile as any);
      })
      .catch((err) => {
        console.error("Failed to load profile on init:", err);
      });
  }, []);

  useEffect(() => {
    const rawBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    const healthBase = rawBase.endsWith('/api') ? rawBase.slice(0, -4) : rawBase;
    fetch(`${healthBase}/health`).catch(() => {});
  }, []);

  const handleOnboardingComplete = async (profile: StudentProfile) => {
    try {
      await refreshUser();

      if (profile.activities && Array.isArray(profile.activities)) {
        for (const activity of profile.activities) {
          try {
            await api.addActivity(activity);
          } catch {
            // non-critical
          }
        }
      }

      setStudentProfile(profile);
    } catch (error) {
      console.error("Failed to refresh after onboarding:", error);
    }
  };

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />

      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/terms" element={<Terms />} />

          <Route
            path="/onboarding"
            element={
              <ProtectedRoute requireOnboarding={false}>
                <OnboardingPage onComplete={handleOnboardingComplete} />
              </ProtectedRoute>
            }
          />

          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/colleges" element={<Colleges />} />
            <Route path="/colleges/:id" element={<CollegeDetails />} />
            <Route path="/applications" element={<Applications />} />
            <Route path="/requirements" element={<Requirements />} />
            <Route path="/deadlines" element={<Deadlines />} />
            <Route path="/essays" element={<Essays />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/scholarships" element={<Scholarships />} />
            <Route path="/financial-aid" element={<Navigate to="/scholarships" replace />} />
            <Route path="/recommenders" element={<Recommendations />} />
            <Route path="/recommendations" element={<Recommendations />} />
            <Route path="/college-recommendations" element={<CollegeRecommendations />} />
            <Route path="/chancing" element={<Chancing />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Settings />} />
            <Route path="/admin" element={user?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/dashboard" replace />} />
          </Route>

          <Route path="*" element={<NotFound />} />
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
            <TutorialProvider>
              <AppContent />
              <TutorialOverlay />
            </TutorialProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
