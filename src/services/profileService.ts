/**
 * ProfileService - Centralized User Profile Management
 * 
 * This service provides a single source of truth for user profile data.
 * It handles persistent storage (currently localStorage, designed for future backend migration).
 * 
 * Key principles:
 * - All profile updates go through this service
 * - Automatic persistence to localStorage
 * - Type-safe interfaces
 * - Easy to migrate to backend API later
 */

// ============================================
// TypeScript Interfaces
// ============================================

export interface UserProfile {
  // Core user data
  id?: number;
  email?: string;
  full_name?: string;
  country?: string;
  
  // Onboarding completion flag
  onboarding_complete: boolean;
  profileCompleted: boolean; // UI-friendly alias
  
  // Academic information
  grade?: string;
  currentBoard?: string;
  currentGPA?: string;
  gpa?: number;
  academic_board?: string;
  subjects?: string[];
  percentage?: number;
  grade_level?: string;
  graduation_year?: number;
  
  // Test scores
  satScore?: string;
  actScore?: string;
  ibPredicted?: string;
  test_status?: {
    satScore?: string | null;
    actScore?: string | null;
    ibPredicted?: string | null;
  };
  
  // College preferences
  preferredCountries?: string[];
  target_countries?: string[];
  potentialMajors?: string[];
  intended_majors?: string[];
  budgetRange?: string;
  max_budget_per_year?: number;
  campusSize?: string;
  locationPreference?: string;
  need_financial_aid?: boolean;
  can_take_loan?: boolean;
  
  // Activities and achievements
  activities?: any[];
  leadership?: string[];
  awards?: string[];
  
  // Career and goals
  careerInterests?: string[];
  careerGoals?: string;
  whyCollege?: string;
  skillsStrengths?: string[];
  
  // Other preferences
  language_preferences?: string[];
  
  // Metadata
  created_at?: string;
  updated_at?: string;
  lastSyncedAt?: string;
}

export interface ProfileUpdateOptions {
  syncToBackend?: boolean; // Future: sync to API
  silent?: boolean; // Don't trigger events/callbacks
}

// ============================================
// ProfileService Class
// ============================================

class ProfileService {
  private static readonly PROFILE_KEY = 'userProfile';
  private static readonly BACKUP_KEY = 'userProfile_backup';
  private static readonly VERSION_KEY = 'profileVersion';
  private static readonly CURRENT_VERSION = '1.0.0';
  
  /**
   * Get the current user profile from localStorage
   * Returns null if no profile exists
   */
  getProfile(): UserProfile | null {
    try {
      const profileData = localStorage.getItem(ProfileService.PROFILE_KEY);
      if (!profileData) {
        return null;
      }
      
      const profile = JSON.parse(profileData) as UserProfile;
      
      // Ensure backward compatibility
      if (profile.onboarding_complete !== undefined) {
        profile.profileCompleted = profile.onboarding_complete;
      }
      
      return profile;
    } catch (error) {
      console.error('ProfileService: Error reading profile from localStorage', error);
      return this.getBackupProfile();
    }
  }
  
  /**
   * Save user profile to localStorage
   * Creates automatic backup before saving
   */
  saveProfile(profile: Partial<UserProfile>, options: ProfileUpdateOptions = {}): void {
    try {
      // Get existing profile
      const existingProfile = this.getProfile() || {} as UserProfile;
      
      // Merge with new data
      const updatedProfile: UserProfile = {
        ...existingProfile,
        ...profile,
        updated_at: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
      };
      
      // Ensure profileCompleted is in sync with onboarding_complete
      if (profile.onboarding_complete !== undefined) {
        updatedProfile.profileCompleted = profile.onboarding_complete;
      } else if (profile.profileCompleted !== undefined) {
        updatedProfile.onboarding_complete = profile.profileCompleted;
      }
      
      // Create backup of current profile before overwriting
      const currentProfile = localStorage.getItem(ProfileService.PROFILE_KEY);
      if (currentProfile) {
        localStorage.setItem(ProfileService.BACKUP_KEY, currentProfile);
      }
      
      // Save updated profile
      localStorage.setItem(ProfileService.PROFILE_KEY, JSON.stringify(updatedProfile));
      localStorage.setItem(ProfileService.VERSION_KEY, ProfileService.CURRENT_VERSION);
      
      console.log('ProfileService: Profile saved successfully', {
        hasId: !!updatedProfile.id,
        onboardingComplete: updatedProfile.onboarding_complete,
        profileCompleted: updatedProfile.profileCompleted,
      });
    } catch (error) {
      console.error('ProfileService: Error saving profile to localStorage', error);
      throw new Error('Failed to save profile');
    }
  }
  
  /**
   * Update specific fields in the profile
   */
  updateProfile(updates: Partial<UserProfile>, options: ProfileUpdateOptions = {}): void {
    this.saveProfile(updates, options);
  }
  
  /**
   * Mark onboarding as complete
   */
  completeOnboarding(profileData?: Partial<UserProfile>): void {
    const updates: Partial<UserProfile> = {
      ...profileData,
      onboarding_complete: true,
      profileCompleted: true,
    };
    this.saveProfile(updates);
  }
  
  /**
   * Check if user has completed onboarding
   */
  hasCompletedOnboarding(): boolean {
    const profile = this.getProfile();
    return profile?.onboarding_complete === true || profile?.profileCompleted === true;
  }
  
  /**
   * Get backup profile (for error recovery)
   */
  private getBackupProfile(): UserProfile | null {
    try {
      const backupData = localStorage.getItem(ProfileService.BACKUP_KEY);
      if (!backupData) {
        return null;
      }
      return JSON.parse(backupData) as UserProfile;
    } catch (error) {
      console.error('ProfileService: Error reading backup profile', error);
      return null;
    }
  }
  
  /**
   * Clear all profile data (logout, reset)
   */
  clearProfile(): void {
    try {
      localStorage.removeItem(ProfileService.PROFILE_KEY);
      localStorage.removeItem(ProfileService.BACKUP_KEY);
      localStorage.removeItem(ProfileService.VERSION_KEY);
      // Keep studentProfile for backward compatibility temporarily
      localStorage.removeItem('studentProfile');
      console.log('ProfileService: Profile cleared');
    } catch (error) {
      console.error('ProfileService: Error clearing profile', error);
    }
  }
  
  /**
   * Merge backend user data into profile
   * This ensures profile stays in sync with server
   */
  syncFromBackend(backendUser: any): void {
    const currentProfile = this.getProfile() || {} as UserProfile;
    
    const mergedProfile: Partial<UserProfile> = {
      ...currentProfile,
      id: backendUser.id,
      email: backendUser.email,
      full_name: backendUser.full_name || backendUser.name,
      country: backendUser.country,
      onboarding_complete: backendUser.onboarding_complete === 1 || backendUser.onboarding_complete === true,
      profileCompleted: backendUser.onboarding_complete === 1 || backendUser.onboarding_complete === true,
    };
    
    // Parse JSON fields from backend
    if (backendUser.target_countries) {
      try {
        mergedProfile.target_countries = typeof backendUser.target_countries === 'string'
          ? JSON.parse(backendUser.target_countries)
          : backendUser.target_countries;
      } catch (e) {
        console.warn('Failed to parse target_countries', e);
      }
    }
    
    if (backendUser.intended_majors) {
      try {
        mergedProfile.intended_majors = typeof backendUser.intended_majors === 'string'
          ? JSON.parse(backendUser.intended_majors)
          : backendUser.intended_majors;
      } catch (e) {
        console.warn('Failed to parse intended_majors', e);
      }
    }
    
    if (backendUser.test_status) {
      try {
        mergedProfile.test_status = typeof backendUser.test_status === 'string'
          ? JSON.parse(backendUser.test_status)
          : backendUser.test_status;
      } catch (e) {
        console.warn('Failed to parse test_status', e);
      }
    }
    
    if (backendUser.language_preferences) {
      try {
        mergedProfile.language_preferences = typeof backendUser.language_preferences === 'string'
          ? JSON.parse(backendUser.language_preferences)
          : backendUser.language_preferences;
      } catch (e) {
        console.warn('Failed to parse language_preferences', e);
      }
    }
    
    // Add other backend fields
    if (backendUser.gpa !== undefined) mergedProfile.gpa = backendUser.gpa;
    if (backendUser.academic_board) mergedProfile.academic_board = backendUser.academic_board;
    if (backendUser.grade_level) mergedProfile.grade_level = backendUser.grade_level;
    if (backendUser.subjects) mergedProfile.subjects = backendUser.subjects;
    if (backendUser.max_budget_per_year !== undefined) mergedProfile.max_budget_per_year = backendUser.max_budget_per_year;
    if (backendUser.need_financial_aid !== undefined) mergedProfile.need_financial_aid = backendUser.need_financial_aid;
    if (backendUser.can_take_loan !== undefined) mergedProfile.can_take_loan = backendUser.can_take_loan;
    
    this.saveProfile(mergedProfile, { silent: true });
  }
  
  /**
   * Migrate old localStorage data to new format
   * This ensures backward compatibility with existing users
   */
  migrateOldData(): void {
    try {
      // Check if new profile exists
      if (this.getProfile()) {
        return; // Already migrated
      }
      
      // Try to migrate from old studentProfile key
      const oldProfile = localStorage.getItem('studentProfile');
      if (oldProfile) {
        const parsed = JSON.parse(oldProfile);
        this.saveProfile(parsed);
        console.log('ProfileService: Migrated old studentProfile data');
      }
    } catch (error) {
      console.error('ProfileService: Error migrating old data', error);
    }
  }
}

// ============================================
// Export singleton instance
// ============================================

export const profileService = new ProfileService();

// Export for testing
export default profileService;
