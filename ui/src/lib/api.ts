import axios from 'axios';
import { ProjectConfig } from '@pdcp/shared';

// API Configuration
const API_URL = '/api'; // Use relative path, assuming proxy setup in vite.config.ts

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 2 minutes for long-running operations like deployments
});

// Auth Interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Interceptor for 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Types
export interface LoginResponse {
  success: boolean;
  token: string;
}

export interface ProjectsResponse {
    success: boolean;
    data: ProjectConfig[];
}

export interface ProcessStatus {
    name: string;
    pid: number;
    status: string;
    uptime: number;
    cpu: number;
    memory: number;
}
