import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

// Complete User interface with ALL possible fields
export interface User {
  id: number;
  email: string;
  full_name: string;
  country: string;
  onboarding_complete: boolean;
  target_countries?: string; // JSON string
  intended_majors?: string;  // JSON string
  test_status?: string;      // JSON string
  language_preferences?: string; // JSON string
  created_at?: string;
  updated_at?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<any>;
  register: (email: string, password: string, fullName: string, country: string) => Promise<any>;
  logout: () => Promise<void>;
  completeOnboarding: (data: any) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        const response = await api.getCurrentUser();
        setUser(response.data);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('accessToken');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await api.login(email, password);
    setUser(response.data.user);
    return response;
  };

  const register = async (email: string, password: string, fullName: string, country: string) => {
    const response = await api.register(email, password, fullName, country);
    setUser(response.data.user);
    return response;
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  const completeOnboarding = async (data: any) => {
    const response = await api.completeOnboarding(data);
    setUser(response.data);
    return response;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
