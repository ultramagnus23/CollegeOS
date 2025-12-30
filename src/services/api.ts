// src/services/api.ts
// Frontend API service that communicates with the backend
// Centralizes all API calls and handles authentication tokens

const API_BASE_URL: string =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ==================== UTILITY TYPES ====================

type HTTPMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface FetchOptions extends RequestInit {
  method?: HTTPMethod;
  headers?: Record<string, string>;
  body?: string;
}

// Generic API response (adjust if your backend wraps responses differently)
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

// ==================== AUTH HELPERS ====================

// Get auth token from localStorage
const getAuthToken = (): string | null => {
  return localStorage.getItem('token');
};

// Build headers with optional auth token
const getHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

// ==================== FETCH WRAPPER ====================

const fetchAPI = async <T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...getHeaders(),
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message || 'API request failed');
    }

    return data as T;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
};

// ==================== COLLEGES API ====================

export interface CollegeSearchParams {
  country?: string;
  program?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const collegesAPI = {
  /**
   * Search and filter colleges
   */
  search: async <T = unknown>(
    params: CollegeSearchParams = {}
  ): Promise<T> => {
    const queryString = new URLSearchParams(
      params as Record<string, string>
    ).toString();

    return fetchAPI<T>(
      `/colleges${queryString ? `?${queryString}` : ''}`
    );
  },

  /**
   * Get college by ID
   */
  getById: async <T = unknown>(id: number): Promise<T> => {
    return fetchAPI<T>(`/colleges/${id}`);
  },

  /**
   * Check eligibility for a college
   */
  checkEligibility: async <T = unknown>(
    id: number,
    program?: string | null,
    profile?: Record<string, unknown> | null
  ): Promise<T> => {
    const params = program
      ? `?program=${encodeURIComponent(program)}`
      : '';

    return fetchAPI<T>(`/colleges/${id}/eligibility${params}`, {
      method: 'GET',
      body: profile ? JSON.stringify({ profile }) : undefined,
    });
  },

  /**
   * Get all countries
   */
  getCountries: async <T = unknown>(): Promise<T> => {
    return fetchAPI<T>('/colleges/filters/countries');
  },

  /**
   * Get all programs
   */
  getPrograms: async <T = unknown>(): Promise<T> => {
    return fetchAPI<T>('/colleges/filters/programs');
  },
};

// ==================== APPLICATIONS API ====================

export interface ApplicationCreateData {
  college_id: number;
  application_type: string;
  notes?: string;
}

export const applicationsAPI = {
  getAll: async <T = unknown>(): Promise<T> => {
    return fetchAPI<T>('/applications');
  },

  getById: async <T = unknown>(id: number): Promise<T> => {
    return fetchAPI<T>(`/applications/${id}`);
  },

  create: async <T = unknown>(
    data: ApplicationCreateData
  ): Promise<T> => {
    return fetchAPI<T>('/applications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async <T = unknown>(
    id: number,
    updates: Partial<ApplicationCreateData & { status: string }>
  ): Promise<T> => {
    return fetchAPI<T>(`/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async <T = unknown>(id: number): Promise<T> => {
    return fetchAPI<T>(`/applications/${id}`, {
      method: 'DELETE',
    });
  },
};

// ==================== DEADLINES API ====================

export interface DeadlineQueryParams {
  status?: 'upcoming' | 'completed' | 'all';
  college_id?: number;
  limit?: number;
}

export const deadlinesAPI = {
  getAll: async <T = unknown>(
    params: DeadlineQueryParams = {}
  ): Promise<T> => {
    const queryString = new URLSearchParams(
      params as Record<string, string>
    ).toString();

    return fetchAPI<T>(
      `/deadlines${queryString ? `?${queryString}` : ''}`
    );
  },

  getDashboard: async <T = unknown>(): Promise<T> => {
    return fetchAPI<T>('/deadlines/dashboard');
  },

  updateCompletion: async <T = unknown>(
    id: number,
    completed: boolean
  ): Promise<T> => {
    return fetchAPI<T>(`/deadlines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    });
  },
};

// ==================== ESSAYS API ====================

export interface EssayCreateData {
  applicationId: number;
  essayType?: string;
  prompt: string;
  wordLimit?: number | null;
  googleDriveLink?: string;
  notes?: string;
}

export const essaysAPI = {
  getAll: async <T = unknown>(): Promise<T> => {
    return fetchAPI<T>('/essays');
  },

  getById: async <T = unknown>(id: number): Promise<T> => {
    return fetchAPI<T>(`/essays/${id}`);
  },

  create: async <T = unknown>(data: EssayCreateData): Promise<T> => {
    return fetchAPI<T>('/essays', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async <T = unknown>(
    id: number,
    updates: Partial<EssayCreateData & { status: string }>
  ): Promise<T> => {
    return fetchAPI<T>(`/essays/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  delete: async <T = unknown>(id: number): Promise<T> => {
    return fetchAPI<T>(`/essays/${id}`, {
      method: 'DELETE',
    });
  },
};

// ==================== PROFILE API ====================

export const profileAPI = {
  get: async <T = unknown>(): Promise<T> => {
    return fetchAPI<T>('/profile');
  },

  updateAcademic: async <T = unknown>(
    data: Record<string, unknown>
  ): Promise<T> => {
    return fetchAPI<T>('/profile/academic', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
};

// ==================== RECOMMENDATIONS API ====================

export const recommendationsAPI = {
  get: async <T = unknown>(): Promise<T> => {
    return fetchAPI<T>('/recommendations');
  },

  generate: async <T = unknown>(): Promise<T> => {
    return fetchAPI<T>('/recommendations/generate', {
      method: 'POST',
    });
  },
};

// ==================== TIMELINE API ====================

export const timelineAPI = {
  getMonthly: async <T = unknown>(): Promise<T> => {
    return fetchAPI<T>('/timeline/monthly');
  },
};

// ==================== AUTH API ====================

export interface RegisterData {
  name: string;
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export const authAPI = {
  register: async <T = unknown>(
    userData: RegisterData
  ): Promise<T> => {
    return fetchAPI<T>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  login: async <T = unknown>(
    credentials: LoginData
  ): Promise<T> => {
    return fetchAPI<T>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  logout: async <T = unknown>(): Promise<T> => {
    return fetchAPI<T>('/auth/logout', {
      method: 'POST',
    });
  },
};

// ==================== DEFAULT EXPORT ====================

const api = {
  colleges: collegesAPI,
  applications: applicationsAPI,
  deadlines: deadlinesAPI,
  essays: essaysAPI,
  profile: profileAPI,
  recommendations: recommendationsAPI,
  timeline: timelineAPI,
  auth: authAPI,
};

export default api;
