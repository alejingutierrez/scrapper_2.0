import axios from 'axios';

// API Configuration
// When developing locally we talk directly to the FastAPI backend running on
// port 8000. In production (or when a specific URL is provided) we keep the
// ``/api`` prefix so that requests can be proxied by Nginx/Vercel.
const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : '/api');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Types
export interface StartScrapingRequest {
  domains: string[];
}

export interface StartScrapingResponse {
  message: string;
  task_id: string;
}

export interface JobStatusResponse {
  task_id: string;
  status: string;
  progress?: {
    total: number;
    completed: number;
    success: number;
    failed: number;
    percent: string;
  };
  error?: string;
}

export interface HealthCheckResponse {
  status: string;
  message: string;
}

// API Functions
export const apiService = {
  // Health check
  async healthCheck(): Promise<HealthCheckResponse> {
    const response = await api.get('');
    return response.data;
  },

  // Start scraping job
  async startScraping(request: StartScrapingRequest): Promise<StartScrapingResponse> {
    const response = await api.post('/scrape', request);
    const data = response.data;
    // When the backend is not configured or returns an error, the proxy API
    // responds with an ``error``/``status`` field instead of the expected
    // ``task_id``. Surface this as a rejected promise so callers can handle it
    // gracefully.
    if (!data?.task_id) {
      throw new Error(data?.message || data?.error || 'SCRAPER_API_URL not configured');
    }
    return data;
  },

  // Get job status
  async getJobStatus(taskId: string): Promise<JobStatusResponse> {
    const response = await api.get(`/scrape/status/${taskId}`);
    return response.data;
  },

  // Stop job
  async stopJob(taskId: string): Promise<void> {
    await api.post(`/scrape/stop/${taskId}`);
  },

  // Get all jobs (if we implement this endpoint later)
  async getAllJobs(): Promise<any[]> {
    try {
      const response = await api.get('/jobs');
      return response.data;
    } catch (error) {
      // If endpoint doesn't exist yet, return empty array
      console.warn('Jobs endpoint not available yet');
      return [];
    }
  },

  // Get job results (if we implement this endpoint later)
  async getJobResults(taskId: string): Promise<any[]> {
    try {
      const response = await api.get(`/scrape/results/${taskId}`);
      return response.data;
    } catch (error) {
      console.warn('Job results endpoint not available yet');
      return [];
    }
  },

  // Export results (if we implement this endpoint later)
  async exportResults(taskId: string, format: 'json' | 'csv' | 'xlsx'): Promise<Blob> {
    try {
      const response = await api.get(`/scrape/export/${taskId}`, {
        params: { format },
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.warn('Export endpoint not available yet');
      throw error;
    }
  },
};

export default api;
