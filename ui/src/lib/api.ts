import axios from 'axios';
import { ProjectConfig } from '@runway/shared';

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

// Deploy Analysis Types
export interface DeployWarning {
  level: 'info' | 'warning' | 'critical';
  message: string;
  code: string;
}

/**
 * Analysis result from backend
 * Backend trusts user-declared type - no auto-detection
 */
export interface DeployAnalysis {
  // User's declared type (trusted, not validated)
  declaredType: 'react' | 'next' | 'node' | 'static';
  // Package state
  hasPackageJson: boolean;
  hasBuildScript: boolean;
  hasStartScript: boolean;
  // Build state (generic detection)
  hasBuildOutput: boolean;
  buildOutputDir: string | null;
  requiresBuild: boolean;
  // Prebuilt detection (generic)
  isPrebuiltProject: boolean;
  // Static site detection (generic)
  isStaticSite: boolean;
  // Deployment strategy
  strategy: 'static' | 'build-and-serve' | 'serve-prebuilt';
  serveMethod: 'caddy-static' | 'pm2-proxy';
  // Warnings
  warnings: DeployWarning[];
  requiresConfirmation: boolean;
  confirmationReason?: string;
}

/**
 * Analyze project before deployment
 * @param file - The zip file to analyze
 * @param declaredType - REQUIRED - User-selected project type (backend trusts this)
 */
export async function analyzeProject(
  file: File,
  declaredType: 'react' | 'next' | 'node' | 'static'
): Promise<DeployAnalysis> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', declaredType);

  const response = await api.post<{ success: boolean; data: DeployAnalysis }>(
    '/project/analyze',
    formData,
    {
      timeout: 60000, // 1 minute for analysis
      headers: {
        'Content-Type': undefined, // Override default JSON header - axios will set correct multipart header with boundary
      },
    }
  );

  return response.data.data;
}
