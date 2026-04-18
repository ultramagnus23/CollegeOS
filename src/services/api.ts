// ============================================
// FILE: src/services/api.ts - COMPLETE VERSION WITH ALL ROUTES AND NAMESPACES
// ============================================

import { apiFetch } from '../utils/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// ==================== DEBUG LOGGING UTILITIES ====================
// Debug mode is enabled in development, disabled in production
const DEBUG_MODE = process.env.NODE_ENV !== 'production';

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function logDebug(requestId: string, stage: string, message: string, data?: any) {
  if (!DEBUG_MODE) return;
  const prefix = `[API ${requestId}] [${stage}]`;
  if (data !== undefined) {
    console.debug(`${prefix} ${message}`, data);
  } else {
    console.debug(`${prefix} ${message}`);
  }
}

function logError(requestId: string, stage: string, message: string, error?: any) {
  const prefix = `[API ${requestId}] [${stage}] ❌`;
  console.error(`${prefix} ${message}`);
  if (error) {
    console.error(`${prefix} Error details:`, {
      name: error?.name,
      message: error?.message,
      stack: error?.stack?.split('\n').slice(0, 5).join('\n')
    });
  }
}

class ApiService {
  private baseUrl: string;
  private token: string | null;
  private refreshing: boolean = false;

  constructor() {
    this.baseUrl = API_BASE_URL;
    this.token = localStorage.getItem('accessToken');
    logDebug('init', 'INIT', `ApiService initialized with baseUrl: ${this.baseUrl}`);
  }

  setToken(token: string | null) {
    const requestId = generateRequestId();
    logDebug(requestId, 'TOKEN', token ? 'Setting new token' : 'Clearing token');
    this.token = token;
    if (token) {
      localStorage.setItem('accessToken', token);
    } else {
      localStorage.removeItem('accessToken');
    }
  }

  clearTokens() {
    const requestId = generateRequestId();
    logDebug(requestId, 'TOKEN', 'Clearing all tokens');
    this.token = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  private async request(endpoint: string, options: RequestInit = {}, retryCount: number = 0) {
    const requestId = generateRequestId();
    const method = options.method || 'GET';
    const startTime = performance.now();
    const MAX_RETRIES = 1; // Only retry once to prevent infinite loops
    
    // Log request start
    logDebug(requestId, 'REQUEST', `${method} ${endpoint}`, {
      hasBody: !!options.body,
      bodySize: options.body ? (options.body as string).length : 0,
      retryCount
    });
    
    // Refresh token from localStorage before each request
    this.token = localStorage.getItem('accessToken');
    logDebug(requestId, 'AUTH', this.token ? 'Token present' : 'No token - request may fail if auth required');
    
    let response: Response;
    try {
      response = await apiFetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: this.getHeaders(),
      });
      
      const duration = (performance.now() - startTime).toFixed(2);
      logDebug(requestId, 'RESPONSE', `Status ${response.status} in ${duration}ms`, {
        ok: response.ok,
        statusText: response.statusText
      });
    } catch (networkError: any) {
      logError(requestId, 'NETWORK', `Network request failed to ${endpoint}`, networkError);
      throw new Error(`Network error: Could not connect to server. Is the backend running at ${this.baseUrl}?`);
    }

    // Attempt to parse JSON always (backend returns JSON)
    let data;
    try {
      data = await response.json();
      logDebug(requestId, 'PARSE', 'JSON parsed successfully', {
        success: data?.success,
        hasData: !!data?.data,
        dataType: typeof data?.data,
        count: data?.count,
        errorType: data?.errorType
      });
    } catch (e: any) {
      logError(requestId, 'PARSE', 'Failed to parse JSON response', e);
      data = {};
    }

    // Handle 401 Unauthorized - try to refresh token (only once)
    if (response.status === 401 && (data as any)?.errorType === 'TOKEN_EXPIRED' && retryCount < MAX_RETRIES) {
      logDebug(requestId, 'TOKEN_REFRESH', 'Access token expired, attempting refresh');
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (refreshToken && endpoint !== '/auth/refresh' && !this.refreshing) {
        try {
          this.refreshing = true;
          // Attempt to refresh the access token
          const refreshResponse = await apiFetch(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          
          const refreshData = await refreshResponse.json();
          
          if (refreshResponse.ok && (refreshData as any)?.data?.accessToken) {
            // Update access token and retry the original request
            const newAccessToken = (refreshData as any).data.accessToken;
            this.setToken(newAccessToken);
            logDebug(requestId, 'TOKEN_REFRESH', 'Token refreshed successfully, retrying request');
            
            // Retry original request with new token (increment retry count)
            return this.request(endpoint, options, retryCount + 1);
          } else {
            logError(requestId, 'TOKEN_REFRESH', 'Failed to refresh token', refreshData);
            // Clear tokens and force re-login
            this.clearTokens();
          }
        } catch (refreshError: any) {
          logError(requestId, 'TOKEN_REFRESH', 'Error during token refresh', refreshError);
          // Clear tokens and force re-login
          this.clearTokens();
        } finally {
          this.refreshing = false;
        }
      } else {
        if (this.refreshing) {
          logDebug(requestId, 'TOKEN_REFRESH', 'Already refreshing token, skipping');
        } else {
          logDebug(requestId, 'TOKEN_REFRESH', 'No refresh token available or already on refresh endpoint');
          // Clear tokens and force re-login
          this.clearTokens();
        }
      }
    }

    if (!response.ok) {
      const errorMessage = (data as any).message || `API request failed with status ${response.status}`;
      logError(requestId, 'ERROR', `API Error: ${errorMessage}`, {
        status: response.status,
        endpoint,
        method,
        responseData: data
      });
      throw new Error(errorMessage);
    }

    const totalDuration = (performance.now() - startTime).toFixed(2);
    logDebug(requestId, 'COMPLETE', `Request completed in ${totalDuration}ms`);
    
    return data;
  }

  // ==================== AUTH ENDPOINTS ====================

  async register(email: string, password: string, fullName: string, country: string) {
    const response = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName, country }),
    });

    if ((response as any).data?.tokens) {
      this.setToken((response as any).data.tokens.accessToken);
      localStorage.setItem('refreshToken', (response as any).data.tokens.refreshToken);
    }

    return response;
  }

  async login(email: string, password: string) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if ((response as any).data?.tokens) {
      this.setToken((response as any).data.tokens.accessToken);
      localStorage.setItem('refreshToken', (response as any).data.tokens.refreshToken);
    }

    return response;
  }

  async googleLogin(googleId: string, email: string, name: string) {
    const response = await this.request('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ googleId, email, name }),
    });

    if ((response as any).data?.tokens) {
      this.setToken((response as any).data.tokens.accessToken);
      localStorage.setItem('refreshToken', (response as any).data.tokens.refreshToken);
    }

    return response;
  }

  async logout() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      try {
        await this.request('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      } catch (error) {
        // Ignore errors during logout - user is logging out anyway
        const requestId = generateRequestId();
        logError(requestId, 'LOGOUT', 'Logout error (ignored)', error);
      }
    }
    this.clearTokens();
    return { success: true };
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  async completeOnboarding(data: any) {
    return this.request('/auth/onboarding', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async completeTour() {
    return this.request('/auth/tour-complete', {
      method: 'PATCH',
    });
  }

  async googleOnboarding(payload: { googleId: string; email: string; name: string; profile: any }) {
    return this.request('/auth/google-onboarding', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async patchOnboardingProgress(googleId: string, progress: any) {
    return this.request(`/users/${googleId}/onboarding-progress`, {
      method: 'PATCH',
      body: JSON.stringify(progress),
    });
  }

  // ==================== PROFILE ENDPOINTS ====================

  async getProfile() {
    return this.request('/profile');
  }

  async updateAcademicProfile(data: any) {
    return this.request('/profile/academic', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateProfile(data: any) {
    return this.request('/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Extended student profile
  async getExtendedProfile() {
    return this.request('/profile/extended');
  }

  async saveExtendedProfile(data: any) {
    return this.request('/profile/extended', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ==================== NEW PROFILE MANAGEMENT ENDPOINTS ====================

  // Get complete profile by user ID
  async getProfileById(userId: number) {
    return this.request(`/profile/${userId}`);
  }

  // Update basic info
  async updateBasicInfo(userId: number, data: any) {
    return this.request(`/profile/${userId}/basic`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Update academic info
  async updateAcademicInfo(userId: number, data: any) {
    return this.request(`/profile/${userId}/academic`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Update subjects
  async updateSubjects(userId: number, data: any) {
    return this.request(`/profile/${userId}/subjects`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Update test scores
  async updateTestScores(userId: number, data: any) {
    return this.request(`/profile/${userId}/test-scores`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Update activities
  async updateProfileActivities(userId: number, data: any) {
    return this.request(`/profile/${userId}/activities`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Delete specific activity
  async deleteProfileActivity(userId: number, activityId: number) {
    return this.request(`/profile/${userId}/activities/${activityId}`, {
      method: 'DELETE',
    });
  }

  // Update preferences
  async updatePreferences(userId: number, data: any) {
    return this.request(`/profile/${userId}/preferences`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Get completion status
  async getCompletionStatus(userId: number) {
    return this.request(`/profile/${userId}/completion-status`);
  }

  // Get unified profile completion (single source of truth)
  async getProfileCompletion() {
    return this.request('/profile/completion');
  }

  // Save onboarding draft
  async saveOnboardingDraft(userId: number, data: any) {
    return this.request(`/profile/${userId}/onboarding-draft`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Get onboarding draft
  async getOnboardingDraft(userId: number) {
    return this.request(`/profile/${userId}/onboarding-draft`);
  }

  // Activities
  async getActivities() {
    return this.request('/profile/activities');
  }

  async addActivity(data: any) {
    return this.request('/profile/activities', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateActivity(id: number, data: any) {
    return this.request(`/profile/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteActivity(id: number) {
    return this.request(`/profile/activities/${id}`, {
      method: 'DELETE',
    });
  }

  async reorderActivities(activityIds: number[]) {
    return this.request('/profile/activities/reorder', {
      method: 'POST',
      body: JSON.stringify({ activityIds }),
    });
  }

  // ==================== CHANCING ENDPOINTS ====================

  async calculateChance(collegeId: number) {
    return this.request('/chancing/calculate', {
      method: 'POST',
      body: JSON.stringify({ collegeId }),
    });
  }

  async calculateChanceBatch(collegeIds: number[]) {
    return this.request('/chancing/batch', {
      method: 'POST',
      body: JSON.stringify({ collegeIds }),
    });
  }

  async getMyListChancing() {
    return this.request('/chancing/my-list');
  }

  async getChancingRecommendations(options: { limit?: number; country?: string } = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', String(options.limit));
    if (options.country) params.append('country', options.country);
    const queryString = params.toString();
    return this.request(`/chancing/recommendations${queryString ? `?${queryString}` : ''}`);
  }

  async getProfileStrength() {
    return this.request('/chancing/profile-strength');
  }

  // ==================== COLLEGE ENDPOINTS ====================

  async getColleges(filters: any = {}) {
    // Properly serialize filters to query string
    const params = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
        params.append(key, String(filters[key]));
      }
    });
    const queryString = params.toString();
    return this.request(`/colleges${queryString ? `?${queryString}` : ''}`);
  }

  async searchColleges(query: string, filters: any = {}) {
    const params = new URLSearchParams();
    params.append('q', query);
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
        params.append(key, String(filters[key]));
      }
    });
    return this.request(`/colleges/search?${params.toString()}`);
  }

  async getCollegeById(id: number) {
    return this.request(`/colleges/${id}`);
  }

  async getCollegeData(id: number, type: string) {
    return this.request(`/colleges/${id}/data?type=${type}`);
  }

  // ==================== APPLICATION ENDPOINTS ====================

  async getApplications(filters: any = {}) {
    const params = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
        params.append(key, String(filters[key]));
      }
    });
    const queryString = params.toString();
    return this.request(`/applications${queryString ? `?${queryString}` : ''}`);
  }

  async createApplication(data: any) {
    return this.request('/applications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateApplication(id: number, data: any) {
    return this.request(`/applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteApplication(id: number) {
    return this.request(`/applications/${id}`, {
      method: 'DELETE',
    });
  }

  async getApplicationTimeline(id: number) {
    return this.request(`/applications/${id}/timeline`);
  }

  // ==================== DEADLINE ENDPOINTS ====================

  async getDeadlines(daysAhead: number = 30) {
    return this.request(`/deadlines?daysAhead=${daysAhead}`);
  }

  async createDeadline(data: any) {
    return this.request('/deadlines', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDeadline(id: number, data: any) {
    return this.request(`/deadlines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteDeadline(id: number) {
    return this.request(`/deadlines/${id}`, {
      method: 'DELETE',
    });
  }

  // ==================== DOCUMENT ENDPOINTS (flat methods) ====================

  async getDocuments(filters: { category?: string; status?: string; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (filters.category) params.append('category', filters.category);
    if (filters.status) params.append('status', filters.status);
    if (filters.limit) params.append('limit', String(filters.limit));
    const qs = params.toString();
    return this.request(`/documents${qs ? `?${qs}` : ''}`);
  }

  async createDocument(data: any) {
    return this.request('/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDocument(id: number, data: any) {
    return this.request(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteDocument(id: number) {
    return this.request(`/documents/${id}`, {
      method: 'DELETE',
    });
  }

  async getDocumentSummary() {
    return this.request('/documents/summary');
  }

  // ==================== ESSAY ENDPOINTS ====================

  async getEssays() {
    return this.request('/essays');
  }

  async createEssay(data: any) {
    return this.request('/essays', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEssay(id: number, data: any) {
    return this.request(`/essays/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteEssay(id: number) {
    return this.request(`/essays/${id}`, {
      method: 'DELETE',
    });
  }

  // ==================== RECOMMENDATIONS ENDPOINTS ====================

  async getRecommendations() {
    return this.request('/recommendations');
  }

  async generateRecommendations() {
    return this.request('/recommendations/generate', {
      method: 'POST',
    });
  }

  // ==================== TIMELINE ENDPOINTS ====================

  async getMonthlyTimeline() {
    return this.request('/timeline/monthly');
  }

  // ==================== CHATBOT ENDPOINTS ====================

  async chatbotChat(message: string, conversationHistory: any[] = []) {
    return this.request('/chatbot/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationHistory }),
    });
  }

  async getChatbotStatus() {
    return this.request('/chatbot/status');
  }

  // ==================== COMPATIBILITY NAMESPACES ====================

  // Profile namespace
  profile = {
    get: () => this.getProfile(),
    updateAcademic: (data: any) => this.updateAcademicProfile(data),
  };

  // Recommendations namespace
  recommendations = {
    get: () => this.getRecommendations(),
    generate: () => this.generateRecommendations(),
  };

  // Vector-based ML recommendations namespace
  recommend = {
    /**
     * POST /api/recommend
     * Returns top 50 colleges by cosine similarity + admit chance.
     */
    getColleges: (filters: Record<string, any> = {}) =>
      this.request('/recommend', {
        method: 'POST',
        body: JSON.stringify({ filters }),
      }),

    /**
     * GET /api/recommend/majors
     * Returns top major categories and specific majors that match the user's
     * interest vector dimensions.
     */
    getMajors: () => this.request('/recommend/majors'),
  };

  // Signals namespace — fire interaction signals for online learning
  signals = {
    /**
     * Fire a signal when the user interacts with a college.
     * type: 'added' | 'dismissed' | 'viewed' | 'removed'
     */
    fire: (collegeId: number, type: 'added' | 'dismissed' | 'viewed' | 'removed') =>
      this.request('/signals', {
        method: 'POST',
        body: JSON.stringify({ collegeId, type }),
      }),

    getAll: () => this.request('/signals'),
  };

  // IPEDS majors namespace
  majors = {
    /** GET /api/colleges/majors — full master list */
    getAll: () => this.request('/colleges/majors'),

    /** GET /api/colleges/majors/search?q=... */
    search: (q: string) =>
      this.request(`/colleges/majors/search?q=${encodeURIComponent(q)}`),

    /** GET /api/colleges/:id/majors — majors for a specific college */
    getForCollege: (collegeId: number) =>
      this.request(`/colleges/${collegeId}/majors`),
  };

  // Timeline namespace
  timeline = {
    getMonthly: () => this.getMonthlyTimeline(),
  };

  // Colleges namespace (as used by pages)
  colleges = {
    get: (filters: any = {}) => this.getColleges(filters),

    // Accepts either { q, country, ... } for search endpoint or { search, country, ... } for list
    search: (params: any = {}) => {
      const { searchTerm, ...rest } = params || {};
      const normalized: any = { ...rest };
      // Normalize searchTerm -> search (backend expects 'search' for list; 'q' for search endpoint)
      if (searchTerm && !normalized.search && !normalized.q) normalized.search = searchTerm;

      if (normalized.q) {
        const { q, ...filters } = normalized;
        return this.searchColleges(q, filters);
      }
      return this.getColleges(normalized);
    },

    getById: (id: number) => this.getCollegeById(id),
    
    getCollegeData: (id: number, type: string) => this.getCollegeData(id, type),

    getCountries: () => this.request('/colleges/filters/countries'),
    getPrograms: () => this.request('/colleges/filters/programs'),

    checkEligibility: (id: number, program?: string) =>
      this.request(`/colleges/${id}/eligibility${program ? `?program=${encodeURIComponent(program)}` : ''}`),
  };

  // Chatbot namespace
  chatbot = {
    chat: (message: string, conversationHistory?: any[]) => 
      this.chatbotChat(message, conversationHistory),
    status: () => this.getChatbotStatus(),
  };

  // ==================== AUTOMATION ENDPOINTS ====================
  
  // Automation namespace - Magic automation features
  automation = {
    // Detect curriculum from school name
    detectCurriculum: (schoolName: string) => 
      this.request('/automation/detect-curriculum', {
        method: 'POST',
        body: JSON.stringify({ schoolName }),
      }),
    
    // Detect country from location
    detectCountry: (location: string) =>
      this.request('/automation/detect-country', {
        method: 'POST',
        body: JSON.stringify({ location }),
      }),
    
    // Check English proficiency exemption
    checkExemption: (profile: any, targetCountry: string) =>
      this.request('/automation/check-exemption', {
        method: 'POST',
        body: JSON.stringify({ profile, targetCountry }),
      }),
    
    // Get application system for a country
    getApplicationSystem: (country: string) =>
      this.request(`/automation/application-system/${encodeURIComponent(country)}`),
    
    // Get recommended actions based on profile
    getRecommendedActions: (profile: any) =>
      this.request('/automation/recommended-actions', {
        method: 'POST',
        body: JSON.stringify({ profile }),
      }),
    
    // Calculate profile strength score
    getProfileStrength: (profile: any) =>
      this.request('/automation/profile-strength', {
        method: 'POST',
        body: JSON.stringify({ profile }),
      }),
    
    // Get college list strategy
    getCollegeListStrategy: (profile: any, options?: any) =>
      this.request('/automation/college-list-strategy', {
        method: 'POST',
        body: JSON.stringify({ profile, options }),
      }),
    
    // Generate personalized recommendations
    generateRecommendations: (profile: any, preferences?: any) =>
      this.request('/automation/recommendations', {
        method: 'POST',
        body: JSON.stringify({ profile, preferences }),
      }),
    
    // Get similar colleges
    getSimilarColleges: (collegeId: string) =>
      this.request(`/automation/similar-colleges/${collegeId}`),
    
    // Get instant recommendations after onboarding
    getInstantRecommendations: (profile: any) =>
      this.request('/automation/instant-recommendations', {
        method: 'POST',
        body: JSON.stringify({ profile }),
      }),
    
    // Get suggestions based on browsing behavior
    getBehaviorSuggestions: (viewedColleges: string[]) =>
      this.request('/automation/behavior-suggestions', {
        method: 'POST',
        body: JSON.stringify({ viewedColleges }),
      }),
  };

  // Applications namespace (as used by pages)
  applications = {
    get: (filters: any = {}) => this.getApplications(filters),
    getAll: (filters: any = {}) => this.getApplications(filters),
    create: (data: any) => this.createApplication(data),
    update: (id: number, data: any) => this.updateApplication(id, data),
    delete: (id: number) => this.deleteApplication(id),
    getDeadlines: (id: number) => this.request(`/applications/${id}/deadlines`),
    getTasks: (id: number) => this.request(`/applications/${id}/tasks`),
    toggleDeadline: (appId: number, deadlineId: number, completed: boolean) =>
      this.request(`/applications/${appId}/deadlines/${deadlineId}`, {
        method: 'PUT',
        body: JSON.stringify({ completed }),
      }),
    toggleTask: (appId: number, taskId: number, completed: boolean) =>
      this.request(`/applications/${appId}/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ completed }),
      }),
  };

  // Deadlines namespace
  deadlines = {
    getAll: (daysAhead?: number) => this.getDeadlines(daysAhead),
    create: (data: any) => this.createDeadline(data),
    update: (id: number, data: any) => this.updateDeadline(id, data),
    delete: (id: number) => this.deleteDeadline(id),
    intelligence: {
      getUpcoming: (days = 90) =>
        this.request(`/deadlines/intelligence/upcoming?days=${days}`),
      getForCollege: (id: number) =>
        this.request(`/deadlines/intelligence/college/${id}`),
      getByCountry: (country: string) =>
        this.request(`/deadlines/intelligence/country/${encodeURIComponent(country)}`),
      getHistory: (collegeId: number) =>
        this.request(`/deadlines/intelligence/history/${collegeId}`),
      refresh: (collegeId: number) =>
        this.request(`/deadlines/intelligence/refresh/${collegeId}`, { method: 'POST' }),
    },
  };

  // Essays namespace
  essays = {
    getAll: () => this.getEssays(),
    create: (data: any) => this.createEssay(data),
    update: (id: number, data: any) => this.updateEssay(id, data),
    delete: (id: number) => this.deleteEssay(id),
  };

  // ==================== DOCUMENTS ENDPOINTS ====================
  
  // Documents namespace - Document Vault
  documents = {
    getAll: (filters?: { category?: string; status?: string; collegeId?: string; limit?: number }) => {
      const params = new URLSearchParams();
      if (filters?.category) params.append('category', filters.category);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.collegeId) params.append('collegeId', filters.collegeId);
      if (filters?.limit) params.append('limit', String(filters.limit));
      const queryString = params.toString();
      return this.request(`/documents${queryString ? `?${queryString}` : ''}`);
    },
    
    getById: (id: number) => this.request(`/documents/${id}`),
    
    getSummary: () => this.request('/documents/summary'),
    
    getExpiring: (days?: number) => 
      this.request(`/documents/expiring${days ? `?days=${days}` : ''}`),
    
    checkForCollege: (collegeId: number, required?: string[]) => {
      const params = required ? `?required=${required.join(',')}` : '';
      return this.request(`/documents/check/${collegeId}${params}`);
    },
    
    create: (data: any) => this.request('/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
    update: (id: number, data: any) => this.request(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    
    tagToColleges: (id: number, collegeIds: number[]) => 
      this.request(`/documents/${id}/tag`, {
        method: 'PUT',
        body: JSON.stringify({ collegeIds }),
      }),
    
    delete: (id: number) => this.request(`/documents/${id}`, {
      method: 'DELETE',
    }),
    
    categories: {
      TRANSCRIPT: 'transcript',
      TEST_SCORE: 'test_score',
      ESSAY: 'essay',
      RECOMMENDATION: 'recommendation',
      FINANCIAL: 'financial',
      PROOF: 'proof',
      PASSPORT: 'passport',
      PORTFOLIO: 'portfolio',
      OTHER: 'other',
    },
  };

  // ==================== SCHOLARSHIPS ENDPOINTS ====================
  
  // Scholarships namespace - Scholarship Database
  scholarships = {
    search: (filters?: { 
      country?: string; 
      needBased?: boolean; 
      meritBased?: boolean; 
      minAmount?: number;
      deadlineAfter?: string;
      search?: string;
      limit?: number;
    }) => {
      const params = new URLSearchParams();
      if (filters?.country) params.append('country', filters.country);
      if (filters?.needBased) params.append('needBased', 'true');
      if (filters?.meritBased) params.append('meritBased', 'true');
      if (filters?.minAmount) params.append('minAmount', String(filters.minAmount));
      if (filters?.deadlineAfter) params.append('deadlineAfter', filters.deadlineAfter);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.limit) params.append('limit', String(filters.limit));
      const queryString = params.toString();
      return this.request(`/scholarships${queryString ? `?${queryString}` : ''}`);
    },
    
    getById: (id: number) => this.request(`/scholarships/${id}`),
    
    getCountries: () => this.request('/scholarships/countries'),
    
    getUserTracked: (status?: string) => 
      this.request(`/scholarships/user/tracked${status ? `?status=${status}` : ''}`),
    
    getEligible: (filters?: { countries?: string[]; nationality?: string; academicLevel?: string }) => {
      const params = new URLSearchParams();
      if (filters?.countries) params.append('countries', filters.countries.join(','));
      if (filters?.nationality) params.append('nationality', filters.nationality);
      if (filters?.academicLevel) params.append('academicLevel', filters.academicLevel);
      const queryString = params.toString();
      return this.request(`/scholarships/user/eligible${queryString ? `?${queryString}` : ''}`);
    },
    
    track: (id: number, status: string = 'interested', notes: string = '') =>
      this.request(`/scholarships/${id}/track`, {
        method: 'POST',
        body: JSON.stringify({ status, notes }),
      }),
    
    updateTracking: (id: number, data: any) =>
      this.request(`/scholarships/${id}/track`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    /**
     * Run the full scholarship matching engine for the current user.
     * Returns ranked results with eligibility, net cost in INR, and match reasons.
     */
    match: () =>
      this.request('/scholarships/match', { method: 'POST', body: JSON.stringify({}) }),

    /**
     * Explain why the current user matches (or doesn't match) a specific scholarship.
     */
    explain: (scholarshipId: number) =>
      this.request('/scholarships/explain', {
        method: 'POST',
        body: JSON.stringify({ scholarshipId }),
      }),

    getGrants: () => this.request('/grants'),
    getGovernmentLoans: () => this.request('/loans/government'),
    getPrivateLoans: () => this.request('/loans/private'),
  };

  // ==================== RECOMMENDERS ENDPOINTS ====================
  
  // Recommenders namespace - Recommendation Manager
  recommenders = {
    getAll: () => this.request('/recommenders'),
    
    getById: (id: number) => this.request(`/recommenders/${id}`),
    
    getSummary: () => this.request('/recommenders/summary'),
    
    getTypes: () => this.request('/recommenders/types'),
    
    create: (data: any) => this.request('/recommenders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
    update: (id: number, data: any) => this.request(`/recommenders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    
    delete: (id: number) => this.request(`/recommenders/${id}`, {
      method: 'DELETE',
    }),
    
    // Request endpoints
    requests: {
      getAll: (filters?: { status?: string; recommenderId?: number; collegeId?: number }) => {
        const params = new URLSearchParams();
        if (filters?.status) params.append('status', filters.status);
        if (filters?.recommenderId) params.append('recommenderId', String(filters.recommenderId));
        if (filters?.collegeId) params.append('collegeId', String(filters.collegeId));
        const queryString = params.toString();
        return this.request(`/recommenders/requests/all${queryString ? `?${queryString}` : ''}`);
      },
      
      getById: (id: number) => this.request(`/recommenders/requests/${id}`),
      
      getOverdue: () => this.request('/recommenders/requests/overdue'),
      
      getPendingReminders: (days?: number) =>
        this.request(`/recommenders/requests/pending-reminders${days ? `?days=${days}` : ''}`),
      
      create: (recommenderId: number, data: any) =>
        this.request(`/recommenders/${recommenderId}/request`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      
      update: (id: number, data: any) =>
        this.request(`/recommenders/requests/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      
      delete: (id: number) =>
        this.request(`/recommenders/requests/${id}`, {
          method: 'DELETE',
        }),
    },
    
    // Email templates
    generateEmailTemplate: (type: 'request' | 'reminder' | 'thank_you', data: any) =>
      this.request('/recommenders/email-template', {
        method: 'POST',
        body: JSON.stringify({ type, data }),
      }),
  };

  // ==================== ELIGIBILITY ENDPOINTS ====================
  
  // Eligibility namespace - Auto-fulfillment checking
  eligibility = {
    check: (profile: any) =>
      this.request('/eligibility/check', {
        method: 'POST',
        body: JSON.stringify(profile),
      }),
    
    getSummary: (profile: any, college?: any) =>
      this.request('/eligibility/summary', {
        method: 'POST',
        body: JSON.stringify({ profile, college }),
      }),
    
    checkDiploma: (profile: any) =>
      this.request('/eligibility/diploma', {
        method: 'POST',
        body: JSON.stringify(profile),
      }),
    
    checkEnglish: (profile: any) =>
      this.request('/eligibility/english', {
        method: 'POST',
        body: JSON.stringify(profile),
      }),
  };

  // ==================== CHANCING ENDPOINTS ====================
  
  // Chancing namespace - Admission probability calculation
  chancing = {
    calculate: (data: { collegeId: number; useML?: boolean }) =>
      this.request('/chancing/calculate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    
    getForStudent: () =>
      this.request('/chancing/my-list'),
    
    batchCalculate: (collegeIds: number[]) =>
      this.request('/chancing/batch', {
        method: 'POST',
        body: JSON.stringify({ collegeIds }),
      }),
  };

  // ==================== ANALYTICS ENDPOINTS ====================
  
  // Analytics namespace - Profile strength and analytics
  analytics = {
    profileStrength: (data?: any) =>
      this.request('/analytics/profile-strength', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    
    compareProfiles: (profiles: any[]) =>
      this.request('/analytics/compare-profiles', {
        method: 'POST',
        body: JSON.stringify({ profiles }),
      }),
    
    collegeList: () =>
      this.request('/analytics/college-list'),
    
    whatIf: (scenarios: any) =>
      this.request('/analytics/what-if', {
        method: 'POST',
        body: JSON.stringify(scenarios),
      }),
  };

  // ==================== NOTIFICATIONS ENDPOINTS ====================
  
  // Notifications namespace
  notifications = {
    getAll: () =>
      this.request('/notifications'),
    
    getUnreadCount: () =>
      this.request('/notifications/unread-count'),
    
    markAsRead: (id: number) =>
      this.request(`/notifications/${id}/read`, {
        method: 'PUT',
      }),
    
    markAllAsRead: () =>
      this.request('/notifications/read-all', {
        method: 'PUT',
      }),
    
    createTest: () =>
      this.request('/notifications/test', {
        method: 'POST',
      }),
  };

  // ==================== FIT CLASSIFICATION ENDPOINTS ====================
  
  // Fit namespace - College fit classification
  fit = {
    get: (collegeId: number) =>
      this.request(`/fit/${collegeId}`),
    
    batchGet: (collegeIds: number[]) =>
      this.request('/fit/batch', {
        method: 'POST',
        body: JSON.stringify({ collegeIds }),
      }),
    
    refresh: (collegeId: number) =>
      this.request(`/fit/${collegeId}/refresh`, {
        method: 'POST',
      }),
  };

  // ==================== RISK ASSESSMENT ENDPOINTS ====================
  
  // Risk namespace - Deadline and task risk
  risk = {
    overview: () =>
      this.request('/risk/overview'),
    
    criticalDeadlines: (days: number = 14) =>
      this.request(`/risk/critical?days=${days}`),
    
    impossibleColleges: () =>
      this.request('/risk/impossible'),
    
    alerts: () =>
      this.request('/risk/alerts'),
  };

  // ==================== WARNINGS ENDPOINTS ====================
  
  // Warnings namespace - System warnings
  warnings = {
    getAll: () =>
      this.request('/warnings'),
    
    getDependencies: (collegeId: number) =>
      this.request(`/warnings/dependencies/${collegeId}`),
    
    dismiss: (id: number) =>
      this.request(`/warnings/${id}/dismiss`, {
        method: 'PUT',
      }),
  };

  // ==================== TASKS ENDPOINTS ====================
  
  // Tasks namespace - Task management
  tasks = {
    getAll: (filters?: { collegeId?: number; status?: string; type?: string }) => {
      const params = new URLSearchParams();
      if (filters?.collegeId) params.append('collegeId', String(filters.collegeId));
      if (filters?.status) params.append('status', filters.status);
      if (filters?.type) params.append('type', filters.type);
      const queryString = params.toString();
      return this.request(`/tasks${queryString ? `?${queryString}` : ''}`);
    },
    
    create: (data: any) =>
      this.request('/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    
    update: (id: number, data: any) =>
      this.request(`/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    
    delete: (id: number) =>
      this.request(`/tasks/${id}`, {
        method: 'DELETE',
      }),
    
    decompose: (collegeId: number) =>
      this.request(`/tasks/decompose/${collegeId}`, {
        method: 'POST',
      }),
  };

  // ==================== AUTH NAMESPACE ====================

  auth = {
    googleOnboarding: (googleId: string, email: string, name: string, profile: any) =>
      this.request('/auth/google-onboarding', {
        method: 'POST',
        body: JSON.stringify({ googleId, email, name, profile }),
      }),

    saveOnboardingProgress: (googleId: string, stepData: any) =>
      this.request(`/users/${googleId}/onboarding-progress`, {
        method: 'PATCH',
        body: JSON.stringify(stepData),
      }),

    getProfile: (googleId: string) =>
      this.request(`/users/${googleId}/profile`),
  };

  // ==================== USER NAMESPACE ====================

  user = {
    getSettings: (googleId: string) =>
      this.request(`/users/${googleId}/settings`),

    updateSettings: (googleId: string, data: any) =>
      this.request(`/users/${googleId}/settings`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  };

  // ==================== ADMIN ENDPOINTS ====================

  async adminHealth() {
    return this.request('/admin/health');
  }

  // ==================== FINANCIAL AID ENDPOINTS ====================

  financial = {
    /** Full COA breakdown for a college */
    getCOA: (collegeId: number, params?: { studentType?: string; currency?: string }) => {
      const q = new URLSearchParams();
      if (params?.studentType) q.append('studentType', params.studentType);
      if (params?.currency) q.append('currency', params.currency);
      const qs = q.toString();
      return this.request(`/financial/coa/${collegeId}${qs ? `?${qs}` : ''}`);
    },

    /** Personalised financial profile for a college (uses scoring engine) */
    getCollegeProfile: (collegeId: number) =>
      this.request(`/financial/college/${collegeId}`),

    /** Net cost after user's scholarships */
    getNetCost: (collegeId: number, params?: { studentType?: string; currency?: string }) => {
      const q = new URLSearchParams();
      if (params?.studentType) q.append('studentType', params.studentType);
      if (params?.currency) q.append('currency', params.currency);
      const qs = q.toString();
      return this.request(`/financial/net-cost/${collegeId}${qs ? `?${qs}` : ''}`);
    },

    /** All colleges in application list ranked by affordability */
    getSummary: () => this.request('/financial/summary'),

    /** Search scholarships */
    searchScholarships: (filters?: {
      country?: string;
      needBased?: boolean;
      meritBased?: boolean;
      minAmount?: number;
      search?: string;
      limit?: number;
      offset?: number;
    }) => {
      const q = new URLSearchParams();
      if (filters?.country) q.append('country', filters.country);
      if (filters?.needBased) q.append('needBased', 'true');
      if (filters?.meritBased) q.append('meritBased', 'true');
      if (filters?.minAmount) q.append('minAmount', String(filters.minAmount));
      if (filters?.search) q.append('search', filters.search);
      if (filters?.limit) q.append('limit', String(filters.limit));
      if (filters?.offset) q.append('offset', String(filters.offset));
      const qs = q.toString();
      return this.request(`/financial/scholarships${qs ? `?${qs}` : ''}`);
    },

    /** Loan options with EMI calculation */
    getLoans: (requiredAmount?: number) =>
      this.request(`/financial/loans${requiredAmount ? `?requiredAmount=${requiredAmount}` : ''}`),

    /** Financing options (legacy endpoint) */
    getFinancingOptions: (params?: { requiredAmount?: number; type?: string }) => {
      const q = new URLSearchParams();
      if (params?.requiredAmount) q.append('requiredAmount', String(params.requiredAmount));
      if (params?.type) q.append('type', params.type);
      const qs = q.toString();
      return this.request(`/financial/financing-options${qs ? `?${qs}` : ''}`);
    },

    /** Compare COA across colleges */
    compare: (collegeIds: number[], params?: { studentType?: string; currency?: string }) => {
      const q = new URLSearchParams();
      q.append('collegeIds', collegeIds.join(','));
      if (params?.studentType) q.append('studentType', params.studentType);
      if (params?.currency) q.append('currency', params.currency);
      return this.request(`/financial/compare?${q.toString()}`);
    },
  };

  // ==================== ML CHANCING ENDPOINTS ====================

  chances = {
    /**
     * GET /api/chances — returns ranked college list from the HuggingFace ML model.
     * Uses the student's stored profile from the backend; call saveExtendedProfile first
     * if the profile has just been updated.
     */
    get: () => this.request('/chances'),

    /**
     * POST /api/chances/invalidate — clears the server-side 24-hour cache for this user.
     * Call this after updating the student profile so the next get() fetches fresh results.
     */
    invalidate: () => this.request('/chances/invalidate', { method: 'POST' }),
  };
}

// Export singleton instance
export const api = new ApiService();

// Also export as default
export default api;
