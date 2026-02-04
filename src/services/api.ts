// ============================================
// FILE: src/services/api.ts - COMPLETE VERSION WITH ALL ROUTES AND NAMESPACES
// ============================================

const API_BASE_URL = 'http://localhost:5000/api';

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
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
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

  private getHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const requestId = generateRequestId();
    const method = options.method || 'GET';
    const startTime = performance.now();
    
    // Log request start
    logDebug(requestId, 'REQUEST', `${method} ${endpoint}`, {
      hasBody: !!options.body,
      bodySize: options.body ? (options.body as string).length : 0
    });
    
    // Refresh token from localStorage before each request
    this.token = localStorage.getItem('accessToken');
    logDebug(requestId, 'AUTH', this.token ? 'Token present' : 'No token - request may fail if auth required');
    
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
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
        count: data?.count
      });
    } catch (e: any) {
      logError(requestId, 'PARSE', 'Failed to parse JSON response', e);
      data = {};
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
    }

    return response;
  }

  async logout() {
    this.setToken(null);
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

  // ==================== RESEARCH ENDPOINTS ====================

  async conductResearch(collegeId: number, researchType: string, forceRefresh: boolean = false) {
    return this.request('/research/on-demand', {
      method: 'POST',
      body: JSON.stringify({ collegeId, researchType, forceRefresh }),
    });
  }

  searchByMajor(major: string, country?: string, limit?: number) {
    const params = new URLSearchParams();
    params.append('major', major);
    if (country) params.append('country', country);
    if (limit) params.append('limit', String(limit));
    return this.request(`/research/majors?${params.toString()}`);
  }

  researchSearch(query: string, country?: string, type?: 'all' | 'major' | 'name') {
    const params = new URLSearchParams();
    params.append('q', query);
    if (country) params.append('country', country);
    if (type) params.append('type', type);
    return this.request(`/research/search?${params.toString()}`);
  }

  async getAvailableMajors() {
    return this.request('/research/majors/list');
  }

  // ==================== INTELLIGENT SEARCH ENDPOINTS ====================

  async intelligentSearch(query: string, filters: any = {}) {
    return this.request('/intelligent-search', {
      method: 'POST',
      body: JSON.stringify({ query, filters }),
    });
  }

  async classifyQuery(query: string) {
    return this.request('/intelligent-search/classify', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
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

  // Research namespace - Major-based search and research
  research = {
    searchByMajor: (major: string, country?: string, limit?: number) => 
      this.searchByMajor(major, country, limit),
    search: (query: string, country?: string, type?: 'all' | 'major' | 'name') => 
      this.researchSearch(query, country, type),
    getAvailableMajors: () => this.getAvailableMajors(),
    conductResearch: (collegeId: number, researchType: string, forceRefresh?: boolean) =>
      this.conductResearch(collegeId, researchType, forceRefresh),
  };

  // Intelligent Search namespace
  smartSearch = {
    search: (query: string, filters?: any) => this.intelligentSearch(query, filters),
    classify: (query: string) => this.classifyQuery(query),
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
    create: (data: any) => this.createApplication(data),
    update: (id: number, data: any) => this.updateApplication(id, data),
    delete: (id: number) => this.deleteApplication(id),
  };
}

// Export singleton instance
export const api = new ApiService();

// Also export as default
export default api;
