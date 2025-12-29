// ============================================
// FILE: src/services/api.ts
// Create this file in your frontend
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
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    return headers;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Auth endpoints
  async register(email: string, password: string, fullName: string, country: string) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName, country }),
    });
  }

  async login(email: string, password: string) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    if (response.data.tokens) {
      this.setToken(response.data.tokens.accessToken);
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

  // College endpoints
  async getColleges(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/colleges?${params}`);
  }

  async searchColleges(query: string, filters = {}) {
    const params = new URLSearchParams({ q: query, ...filters });
    return this.request(`/colleges/search?${params}`);
  }

  async getCollegeById(id: number) {
    return this.request(`/colleges/${id}`);
  }

  async getCollegeData(id: number, type: string) {
    return this.request(`/colleges/${id}/data?type=${type}`);
  }

  // Application endpoints
  async getApplications(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/applications?${params}`);
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

  // Deadline endpoints
  async getDeadlines(daysAhead = 30) {
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

  // Essay endpoints
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

  // Research endpoint
  async conductResearch(collegeId: number, researchType: string, forceRefresh = false) {
    return this.request('/research/on-demand', {
      method: 'POST',
      body: JSON.stringify({ collegeId, researchType, forceRefresh }),
    });
  }
}

export const api = new ApiService();

