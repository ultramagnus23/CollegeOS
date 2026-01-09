// ============================================
// FILE: src/App.tsx - MERGED & OPTIMIZED
// ============================================
import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// UI & Context Imports (From Code 1)
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./layouts/DashboardLayout";

// Page Imports
import AuthPage from "./pages/Auth";
import OnboardingPage from "./pages/Onboarding"; // Mapped from Code 1
import Dashboard from "./pages/Dashboard";
import Discover from "./pages/Discover";
import Colleges from "./pages/Colleges";
import CollegeDetails from "./pages/CollegeDetails";
import Research from "./pages/Research";
import Applications from "./pages/Applications";
import Deadlines from "./pages/Deadlines";
import Essays from "./pages/Essays";
import Settings from "./pages/Settings";
import IntelligentCollegeSearch from './pages/IntelligentCollegeSearch';

// Initialize Query Client
const queryClient = new QueryClient();

// Interface Definition (From Code 2)
interface StudentProfile {
  name: string;
  grade: string;
  currentBoard: string;
  country: string;
  currentGPA: string;
  satScore: string;
  actScore: string;
  subjects: string[];
  majorCertain: boolean | null;
  potentialMajors: string[];
  skillsStrengths: string[];
  preferredCountries: string[];
  budgetRange: string;
  campusSize: string;
  locationPreference: string;
  activities: string[];
  awards: string[];
  careerGoals: string;
  whyCollege: string;
}

const App = () => {
  // ============================================
  // STATE MANAGEMENT (From Code 2)
  // ============================================
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  
  // Check local storage for profile on mount
  useEffect(() => {
    const savedProfile = localStorage.getItem('studentProfile');
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        setStudentProfile(profile);
      } catch (e) {
        console.error('Failed to load profile:', e);
      }
    }
  }, []);

  // Handler for updating state when onboarding finishes
  const handleOnboardingComplete = (profile: StudentProfile) => {
    setStudentProfile(profile);
    localStorage.setItem('studentProfile', JSON.stringify(profile));
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          {/* Toast Notifications */}
          <Toaster />
          <Sonner />
          
          <BrowserRouter>
            <Routes>
              {/* ====================
                  Public Routes 
              ==================== */}
              <Route path="/auth" element={<AuthPage />} />
              
              {/* ====================
                  Onboarding Route
              ==================== */}
              <Route 
                path="/onboarding" 
                element={
                  <ProtectedRoute requireOnboarding={false}>
                    {/* Note: Ensure your OnboardingPage component accepts 
                       an onComplete prop, or updates localStorage internally.
                    */}
                    <OnboardingPage />
                  </ProtectedRoute>
                } 
              />
              
              {/* ====================
                  Protected Dashboard Routes
              ==================== */}
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
                <Route path="deadlines" element={<Deadlines />} />
                <Route path="essays" element={<Essays />} />
                <Route path="settings" element={<Settings />} />
                
                {/* Merged Intelligent Search Route */}
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
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;