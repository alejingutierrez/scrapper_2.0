import React, { createContext, useContext, useReducer, ReactNode } from 'react';

// Types
export interface ScrapingJob {
  id: string;
  domains: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: {
    total: number;
    completed: number;
    success: number;
    failed: number;
    percent: string;
  };
  startTime: Date;
  endTime?: Date;
  results?: any[];
  error?: string;
}

export interface ScrapingState {
  jobs: ScrapingJob[];
  activeJob: ScrapingJob | null;
  isLoading: boolean;
  error: string | null;
  settings: {
    maxConcurrentJobs: number;
    retryAttempts: number;
    timeout: number;
    autoRefresh: boolean;
  };
}

// Actions
type ScrapingAction =
  | { type: 'START_JOB'; payload: { id: string; domains: string[] } }
  | { type: 'UPDATE_JOB_PROGRESS'; payload: { id: string; progress: any } }
  | { type: 'COMPLETE_JOB'; payload: { id: string; results?: any[] } }
  | { type: 'FAIL_JOB'; payload: { id: string; error: string } }
  | { type: 'SET_ACTIVE_JOB'; payload: ScrapingJob | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<ScrapingState['settings']> }
  | { type: 'STOP_JOB'; payload: { id: string } }
  | { type: 'SET_JOB_ERROR'; payload: { id: string; error: string } }
  | { type: 'CLEAR_JOBS' };

// Initial state
const initialState: ScrapingState = {
  jobs: [],
  activeJob: null,
  isLoading: false,
  error: null,
  settings: {
    maxConcurrentJobs: 3,
    retryAttempts: 2,
    timeout: 30000,
    autoRefresh: true,
  },
};

// Reducer
function scrapingReducer(state: ScrapingState, action: ScrapingAction): ScrapingState {
  switch (action.type) {
    case 'START_JOB':
      const newJob: ScrapingJob = {
        id: action.payload.id,
        domains: action.payload.domains,
        status: 'running',
        startTime: new Date(),
      };
      return {
        ...state,
        jobs: [newJob, ...state.jobs],
        activeJob: newJob,
        isLoading: true,
        error: null,
      };

    case 'UPDATE_JOB_PROGRESS':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.id
            ? { ...job, progress: action.payload.progress }
            : job
        ),
        activeJob: state.activeJob?.id === action.payload.id
          ? { ...state.activeJob, progress: action.payload.progress }
          : state.activeJob,
      };

    case 'COMPLETE_JOB':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.id
            ? { ...job, status: 'completed', endTime: new Date(), results: action.payload.results }
            : job
        ),
        activeJob: state.activeJob?.id === action.payload.id ? null : state.activeJob,
        isLoading: false,
      };

    case 'FAIL_JOB':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.id
            ? { ...job, status: 'failed', endTime: new Date(), error: action.payload.error }
            : job
        ),
        activeJob: state.activeJob?.id === action.payload.id ? null : state.activeJob,
        isLoading: false,
        error: action.payload.error,
      };

    case 'SET_ACTIVE_JOB':
      return { ...state, activeJob: action.payload };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };

    case 'CLEAR_JOBS':
      return { ...state, jobs: [], activeJob: null };

    case 'STOP_JOB':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.id
            ? { ...job, status: 'cancelled', endTime: new Date() }
            : job
        ),
        activeJob: state.activeJob?.id === action.payload.id ? null : state.activeJob,
        isLoading: false,
      };

    case 'SET_JOB_ERROR':
      return {
        ...state,
        jobs: state.jobs.map(job =>
          job.id === action.payload.id
            ? { ...job, error: action.payload.error }
            : job
        ),
        activeJob: state.activeJob?.id === action.payload.id
          ? { ...state.activeJob, error: action.payload.error }
          : state.activeJob,
      };

    default:
      return state;
  }
}

// Context
const ScrapingContext = createContext<{
  state: ScrapingState;
  dispatch: React.Dispatch<ScrapingAction>;
} | null>(null);

// Provider
export function ScrapingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(scrapingReducer, initialState);

  return (
    <ScrapingContext.Provider value={{ state, dispatch }}>
      {children}
    </ScrapingContext.Provider>
  );
}

// Hook
export function useScraping() {
  const context = useContext(ScrapingContext);
  if (!context) {
    throw new Error('useScraping must be used within a ScrapingProvider');
  }
  return context;
}

// Export alias for compatibility
export { useScraping as useScrapingContext };
