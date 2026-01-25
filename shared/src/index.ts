export type ProjectType = 'react' | 'next' | 'node';
export type PackageManager = 'npm' | 'yarn' | 'pnpm';
export type DeploymentStatus = 'queued' | 'deploying' | 'online' | 'failed' | 'stopped';

export interface ProjectConfig {
  id: string;
  name: string;
  type: ProjectType;
  port: number;
  createdAt: string;
  pkgManager: PackageManager;
  env?: Record<string, string>;
}

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
