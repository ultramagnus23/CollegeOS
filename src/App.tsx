// FILE: src/App.tsx
import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./layouts/DashboardLayout";

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
import Deadlines from "./pages/Deadlines";
import Essays from "./pages/Essays";
import Settings from "./pages/Settings";

// FIXED: Import the type from the new types.ts file
import { StudentProfile } from "./types";

const queryClient = new QueryClient();

const App = () => {
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  
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

  const handleOnboardingComplete = (profile: StudentProfile) => {
    setStudentProfile(profile);
    localStorage.setItem('studentProfile', JSON.stringify(profile));
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
                <Route path="deadlines" element={<Deadlines />} />
                <Route path="essays" element={<Essays />} />
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
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;