import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import { profileService, UserProfile } from '../services/profileService';

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
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Migrate old data on first load
    profileService.migrateOldData();
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        // First, try to get user from backend
        const response = await api.getCurrentUser();
        const backendUser = response.data;
        
        // Sync backend data to ProfileService
        profileService.syncFromBackend(backendUser);
        
        // Set user state
        setUser(backendUser);
      } else {
        // No token, check if we have cached profile data
        const cachedProfile = profileService.getProfile();
        if (cachedProfile && cachedProfile.id) {
          // We have cached data but no token - this shouldn't happen
          // Clear the cache to force re-authentication
          profileService.clearProfile();
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('accessToken');
      profileService.clearProfile();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await api.login(email, password);
    const user = response.data.user;
    setUser(user);
    
    // Sync to ProfileService
    profileService.syncFromBackend(user);
    
    return response;
  };

  const register = async (email: string, password: string, fullName: string, country: string) => {
    const response = await api.register(email, password, fullName, country);
    const user = response.data.user;
    setUser(user);
    
    // Sync to ProfileService
    profileService.syncFromBackend(user);
    
    return response;
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    
    // Clear ProfileService cache
    profileService.clearProfile();
  };

  const completeOnboarding = async (data: any) => {
    const response = await api.completeOnboarding(data);
    const updatedUser = response.data;
    setUser(updatedUser);
    
    // Mark onboarding as complete in ProfileService
    profileService.completeOnboarding(data);
    
    // Sync full user data from backend
    profileService.syncFromBackend(updatedUser);
    
    return response;
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    // Update ProfileService immediately
    profileService.updateProfile(updates);
    
    // Update local user state (only merge compatible fields)
    if (user) {
      // Create a new user object with only valid User interface fields
      const validUpdates: Partial<User> = {};
      const validKeys: (keyof User)[] = ['id', 'email', 'full_name', 'country', 'onboarding_complete', 
                                          'target_countries', 'intended_majors', 'test_status', 'language_preferences'];
      
      validKeys.forEach(key => {
        if (key in updates && updates[key] !== undefined) {
          (validUpdates as any)[key] = updates[key];
        }
      });
      
      setUser({ ...user, ...validUpdates });
    }
    
    // Note: Backend sync should be handled by the calling component
    // This allows the component to call the appropriate API endpoint
  };

  const refreshUser = async () => {
    try {
      const response = await api.getCurrentUser();
      const backendUser = response.data;
      setUser(backendUser);
      profileService.syncFromBackend(backendUser);
    } catch (error) {
      console.error('Failed to refresh user:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, completeOnboarding, updateProfile, refreshUser }}>
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
