export type ProjectType = 'react' | 'next' | 'node' | 'static';
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'none';
export type DeploymentStatus = 'queued' | 'deploying' | 'online' | 'failed' | 'stopped';
export type ProcessStatus = 'running' | 'stopped' | 'failed' | 'building' | 'online';
export type BuildMode = 'local' | 'server';
export type DeploymentJobStatus = 'queued' | 'building' | 'deploying' | 'success' | 'failed';

export interface ProjectConfig {
  id: string;
  name: string;
  type: ProjectType;
  port: number;
  createdAt: string;
  pkgManager: PackageManager;
  env?: Record<string, string>;
  domains?: string[];
}

export interface ProjectWithStatus extends ProjectConfig {
  status: ProcessStatus;
  memory?: number;
  cpu?: number;
  uptime?: number;
  domain: string;
  runtime: ProjectType;
  lastDeployed: Date;
}

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  version?: string;
  status: DeploymentJobStatus;
  buildMode?: BuildMode;
  logs?: string;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface Activity {
  id: string;
  type: 'deploy' | 'start' | 'stop' | 'error' | 'config' | 'delete';
  projectName: string;
  message: string;
  timestamp: string;
  deploymentId?: string;
}
