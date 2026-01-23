// ============================================
// FILE: src/services/api.ts - COMPLETE VERSION WITH ALL ROUTES AND NAMESPACES
// ============================================

const API_BASE_URL = 'http://localhost:5000/api';

class ApiService {
  private baseUrl: string;
  private token: string | null;

  constructor() {
    this.baseUrl = API_BASE_URL;
    this.token = localStorage.getItem('accessToken');
  }

  setToken(token: string | null) {
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
    // Refresh token from localStorage before each request
    this.token = localStorage.getItem('accessToken');
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: this.getHeaders(),
    });

    // Attempt to parse JSON always (backend returns JSON)
    let data;
    try {
      data = await response.json();
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
      data = {};
    }

    if (!response.ok) {
      const errorMessage = (data as any).message || `API request failed with status ${response.status}`;
      console.error('API Error:', errorMessage, data);
      throw new Error(errorMessage);
    }

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
  intelligentSearch = {
    search: (query: string, filters?: any) => this.intelligentSearch(query, filters),
    classify: (query: string) => this.classifyQuery(query),
  };

  // Chatbot namespace
  chatbot = {
    chat: (message: string, conversationHistory?: any[]) => 
      this.chatbotChat(message, conversationHistory),
    status: () => this.getChatbotStatus(),
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
