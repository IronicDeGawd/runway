export type ProjectType = 'react' | 'next' | 'node';
export type PackageManager = 'npm' | 'yarn' | 'pnpm';
export type DeploymentStatus = 'queued' | 'deploying' | 'online' | 'failed' | 'stopped';
export type ProcessStatus = 'running' | 'stopped' | 'failed' | 'building' | 'online';

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
