import axios from 'axios';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

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
  info: any;
  progress?: {
    total: number;
    completed: number;
    success: number;
    failed: number;
    percent: string;
  };
}

export interface HealthCheckResponse {
  status: string;
  message: string;
}

// API Functions
export const apiService = {
  // Health check
  async healthCheck(): Promise<HealthCheckResponse> {
    const response = await api.get('/');
    return response.data;
  },

  // Start scraping job
  async startScraping(request: StartScrapingRequest): Promise<StartScrapingResponse> {
    const response = await api.post('/scrape', request);
    return response.data;
  },

  // Get job status
  async getJobStatus(taskId: string): Promise<JobStatusResponse> {
    const response = await api.get(`/scrape/status/${taskId}`);
    return response.data;
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

  // Cancel job (if we implement this endpoint later)
  async cancelJob(taskId: string): Promise<void> {
    try {
      await api.delete(`/scrape/${taskId}`);
    } catch (error) {
      console.warn('Cancel job endpoint not available yet');
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
