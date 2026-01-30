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

export interface DeployAnalysis {
  detectedType: 'react' | 'next' | 'node' | 'static';
  hasPackageJson: boolean;
  hasBuildOutput: boolean;
  buildOutputDir: string | null;
  requiresBuild: boolean;
  isStaticSite: boolean;
  isNextStaticExport: boolean;
  isPrebuiltProject: boolean;
  strategy: 'static' | 'build-and-serve' | 'serve-prebuilt';
  serveMethod: 'caddy-static' | 'pm2-proxy';
  warnings: DeployWarning[];
  requiresConfirmation: boolean;
  confirmationReason?: string;
}

// Analyze project before deployment
export async function analyzeProject(
  file: File,
  declaredType?: string
): Promise<DeployAnalysis> {
  const formData = new FormData();
  formData.append('file', file);
  if (declaredType) {
    formData.append('type', declaredType);
  }

  const response = await api.post<{ success: boolean; data: DeployAnalysis }>(
    '/project/analyze',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // 1 minute for analysis
    }
  );

  return response.data.data;
}
