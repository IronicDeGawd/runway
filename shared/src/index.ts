export type ProjectType = 'react' | 'next' | 'node' | 'static';
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'none';
export type DeploymentStatus = 'queued' | 'deploying' | 'online' | 'failed' | 'stopped';
export type ProcessStatus = 'running' | 'stopped' | 'failed' | 'building' | 'online';
export type BuildMode = 'local' | 'server';
export type DeploymentJobStatus = 'queued' | 'building' | 'deploying' | 'success' | 'failed';

// ENV Mutability Tracking Types
export type DeploymentSource = 'ui' | 'cli';
export type UploadType = 'full' | 'dist' | 'build';
export type EnvImmutableReason = 'dist-only' | 'cli-no-injection' | 'static-site';

export interface EnvMutabilityInfo {
  mutable: boolean;
  reason?: EnvImmutableReason;
  message?: string;
}

export interface ProjectConfig {
  id: string;
  name: string;
  type: ProjectType;
  port: number;
  createdAt: string;
  pkgManager: PackageManager;
  env?: Record<string, string>;
  domains?: string[];
  // ENV mutability tracking
  deploymentSource?: DeploymentSource;
  uploadType?: UploadType;
  envMutable?: boolean;
  hasSource?: boolean;
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
  // ENV mutability tracking
  deploymentSource?: DeploymentSource;
  uploadType?: UploadType;
  envInjected?: boolean;
}

export interface Activity {
  id: string;
  type: 'deploy' | 'start' | 'stop' | 'error' | 'config' | 'delete';
  projectName: string;
  message: string;
  timestamp: string;
  deploymentId?: string;
}

// System Domain Configuration Types
export type SecurityMode = 'ip-http' | 'domain-https';
export type VerificationStatus = 'pending' | 'verified' | 'failed';

export interface SystemDomain {
  domain: string;
  verifiedAt: string | null;
  active: boolean;
  verificationStatus: VerificationStatus;
  lastChecked: string | null;
  failureReason?: string;
}

export interface SystemConfig {
  domain?: SystemDomain;
  securityMode: SecurityMode;
  serverIp?: string;
}

export interface VerificationResult {
  success: boolean;
  domain: string;
  resolvedIps: string[];
  serverIp: string;
  error?: string;
}
