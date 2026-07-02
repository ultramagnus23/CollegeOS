// FILE: src/App.tsx
import React, { lazy, Suspense, useState, useEffect, Component, ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./layouts/DashboardLayout";
import PublicOrDashboardLayout from "./layouts/PublicOrDashboardLayout";
import { profileService } from "./services/profileService";
import { api } from "./services/api";
import { fetchWithResilience } from "./services/networkManager";
import { trackDuration, trackMetric } from "./observability";
import { TutorialProvider, TutorialOverlay } from "./components/tutorial/TutorialOverlay";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import { isMastersTrackEnabled } from "./config/featureFlags";
import AuthErrorBoundary from "./components/errors/AuthErrorBoundary";

// Eagerly loaded — on the critical path for first render
import Landing from "./pages/Landing";
import AuthPage from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy-loaded — only downloaded when the user navigates there
const OnboardingRouter = lazy(() => import("./pages/OnboardingRouter"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Colleges = lazy(() => import("./pages/Colleges"));
const CollegeDetails = lazy(() => import("./pages/CollegeDetails"));
const Applications = lazy(() => import("./pages/Applications"));
const Requirements = lazy(() => import("./pages/Requirements"));
const Deadlines = lazy(() => import("./pages/Deadlines"));
const Essays = lazy(() => import("./pages/Essays"));
const Settings = lazy(() => import("./pages/Settings"));
const Documents = lazy(() => import("./pages/Documents"));
const Scholarships = lazy(() => import("./pages/Scholarships"));
const Recommendations = lazy(() => import("./pages/Recommendations"));
const CollegeRecommendations = lazy(() => import("./pages/CollegeRecommendations"));
const Timeline = lazy(() => import("./pages/Timeline").then(m => ({ default: m.Timeline })));
const NotificationsPage = lazy(() => import("./pages/Notifications"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const Chancing = lazy(() => import("./pages/Chancing"));
const SuggestionsPage = lazy(() => import("./pages/Suggestions"));
const SuggestedColleges = lazy(() => import("./pages/SuggestedColleges"));
const Rankings = lazy(() => import("./pages/Rankings"));
const MastersDashboard = lazy(() => import("./pages/MastersDashboard"));
const MastersOnboarding = lazy(() => import("./pages/MastersOnboarding"));
const MastersLayout = lazy(() => import("./layouts/MastersLayout"));
const MastersPrograms = lazy(() => import("./pages/MastersPrograms"));
const MastersProgramDetails = lazy(() => import("./pages/MastersProgramDetails"));
const MastersTimeline = lazy(() => import("./pages/MastersTimeline"));
const MastersDeadlines = lazy(() => import("./pages/MastersDeadlines"));
const MastersFunding = lazy(() => import("./pages/MastersFunding"));
const MastersApplications = lazy(() => import("./pages/MastersApplications"));

const PageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#6366f1', animation: 'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

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
  const { refreshUser, user, authReady } = useAuth();
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);

  useEffect(() => {
    if (!authReady || !user) return;
    profileService
      .getProfileFromBackend()
      .then((profile) => {
        if (profile) setStudentProfile(profile as any);
      })
      .catch((err) => {
        console.error("Failed to load profile on init:", err);
      });
  }, [authReady, user]);

  // Status probe is now fired early in main.tsx before auth resolves.
  // This effect is intentionally removed to avoid a redundant second probe.

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

      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route
              path="/auth"
              element={
                <AuthErrorBoundary>
                  <AuthPage />
                </AuthErrorBoundary>
              }
            />
            {/* Legal pages */}
            <Route path="/terms" element={<LegalPage slug="terms" />} />
            <Route path="/privacy" element={<LegalPage slug="privacy" />} />
            <Route path="/cookies" element={<LegalPage slug="cookies" />} />
            <Route path="/data-retention" element={<LegalPage slug="data-retention" />} />
            <Route path="/account-deletion" element={<LegalPage slug="account-deletion" />} />
            <Route path="/minor-policy" element={<LegalPage slug="minor-policy" />} />
            <Route path="/community-guidelines" element={<LegalPage slug="community-guidelines" />} />
            <Route path="/ai-disclaimer" element={<LegalPage slug="ai-disclaimer" />} />

            <Route
              path="/onboarding"
              element={
                <ProtectedRoute requireOnboarding={false}>
                  <OnboardingRouter onComplete={handleOnboardingComplete} />
                </ProtectedRoute>
              }
            />

            <Route
              path="/suggestions"
              element={
                <ProtectedRoute requireOnboarding={false}>
                  <SuggestionsPage />
                </ProtectedRoute>
              }
            />

            {/* Masters/grad track — consolidated nested routes, flag-gated. */}
            {isMastersTrackEnabled() && (
              <>
                {/* Onboarding is a sibling of MastersLayout, not a child - it must own the
                    full viewport the same way undergrad's /onboarding does (line 174-181
                    above), not render next to the persistent masters sidebar/nav chrome. */}
                <Route
                  path="/masters/onboarding"
                  element={
                    <ProtectedRoute requireOnboarding={false}>
                      <MastersOnboarding />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/masters"
                  element={
                    <ProtectedRoute requireOnboarding={false}>
                      <MastersLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<MastersDashboard />} />
                  <Route path="programs" element={<MastersPrograms />} />
                  <Route path="programs/:id" element={<MastersProgramDetails />} />
                  <Route path="timeline" element={<MastersTimeline />} />
                  <Route path="deadlines" element={<MastersDeadlines />} />
                  <Route path="funding" element={<MastersFunding />} />
                  <Route path="applications" element={<MastersApplications />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </>
            )}

            {/* Public browsing — no login required */}
            <Route element={<PublicOrDashboardLayout />}>
              <Route path="/colleges" element={<Colleges />} />
              <Route path="/colleges/:id" element={<CollegeDetails />} />
            </Route>

            <Route
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
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
              <Route path="/rankings" element={<Rankings />} />
              <Route path="/chancing" element={<Chancing />} />
              <Route path="/suggested-colleges" element={<SuggestedColleges />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Settings />} />
              <Route path="/admin" element={user?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/dashboard" replace />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
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
            <OnboardingProvider>
              <TutorialProvider>
                <AppContent />
                <TutorialOverlay />
              </TutorialProvider>
            </OnboardingProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
