import axios, { AxiosProgressEvent } from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { ProjectType, BuildMode } from '../types';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';

export interface UploadOptions {
  zipPath: string;
  projectName: string;
  projectType: ProjectType;
  version?: string;
  buildMode: BuildMode;
  confirmServerBuild?: boolean;
  // ENV mutability tracking
  deploymentSource?: 'ui' | 'cli';
  envInjected?: boolean;
}

export interface UploadResult {
  success: boolean;
  projectId?: string;
  deploymentId?: string;
  error?: string;
}

export interface DeploymentStatus {
  status: 'queued' | 'building' | 'deploying' | 'success' | 'failed';
  progress?: number;
  logs?: string;
  error?: string;
}

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
  declaredType: ProjectType;
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

export interface AnalyzeResult {
  success: boolean;
  analysis?: DeployAnalysis;
  error?: string;
}

export class UploadService {
  private serverUrl: string;
  private token: string;

  constructor() {
    const config = getConfig();
    if (!config.serverUrl || !config.token) {
      throw new Error('CLI not configured. Run "runway init" first.');
    }
    this.serverUrl = config.serverUrl;
    this.token = config.token;
  }

  async upload(options: UploadOptions): Promise<UploadResult> {
    const { zipPath, projectName, projectType, version, buildMode, confirmServerBuild, deploymentSource, envInjected } = options;

    if (!fs.existsSync(zipPath)) {
      return {
        success: false,
        error: `Zip file not found: ${zipPath}`,
      };
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(zipPath));
    formData.append('name', projectName);
    formData.append('type', projectType);
    formData.append('buildMode', buildMode);
    if (version) {
      formData.append('version', version);
    }
    if (confirmServerBuild) {
      formData.append('confirmServerBuild', 'true');
    }
    // ENV mutability tracking
    if (deploymentSource) {
      formData.append('deploymentSource', deploymentSource);
    }
    if (envInjected !== undefined) {
      formData.append('envInjected', envInjected ? 'true' : 'false');
    }

    // Choose endpoint based on build mode
    const endpoint = buildMode === 'local'
      ? '/api/project/deploy-prebuilt'
      : '/api/project/deploy';

    logger.info(`Uploading to ${this.serverUrl}${endpoint}...`);

    try {
      const response = await axios.post(
        `${this.serverUrl}${endpoint}`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.token}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 300000, // 5 minutes
          onUploadProgress: (progressEvent: AxiosProgressEvent) => {
            if (progressEvent.total) {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              process.stdout.write(`\r  Uploading: ${percent}%`);
            }
          },
        }
      );

      process.stdout.write('\n');

      if (response.data.success) {
        return {
          success: true,
          projectId: response.data.data?.projectId,
          deploymentId: response.data.data?.deploymentId,
        };
      } else {
        return {
          success: false,
          error: response.data.error || 'Unknown error',
        };
      }
    } catch (error) {
      process.stdout.write('\n');

      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error || error.message;
        return {
          success: false,
          error: `Upload failed: ${message}`,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus> {
    try {
      const response = await axios.get(
        `${this.serverUrl}/api/project/status/${deploymentId}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        }
      );

      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.error || error.message);
      }
      throw error;
    }
  }

  async pollDeploymentStatus(
    deploymentId: string,
    onUpdate: (status: DeploymentStatus) => void,
    timeoutMs: number = 300000 // 5 minutes
  ): Promise<DeploymentStatus> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getDeploymentStatus(deploymentId);
      onUpdate(status);

      if (status.status === 'success' || status.status === 'failed') {
        return status;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Deployment timed out');
  }

  async login(username: string, password: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.serverUrl}/api/auth/login`,
        { username, password },
        {
          timeout: 10000,
        }
      );

      if (response.data.success && response.data.data?.token) {
        return response.data.data.token;
      }

      throw new Error(response.data.error || 'Login failed');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.error || error.message);
      }
      throw error;
    }
  }

  async listProjects(): Promise<Array<{ id: string; name: string; type: ProjectType; status: string }>> {
    try {
      const response = await axios.get(
        `${this.serverUrl}/api/project`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        }
      );

      return response.data.data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.error || error.message);
      }
      throw error;
    }
  }

  /**
   * Analyze a package before deployment to get server warnings and recommendations
   */
  /**
   * Analyze a package before deployment
   * @param zipPath - Path to the zip file
   * @param declaredType - REQUIRED - User-selected project type (backend trusts this)
   */
  async analyzePackage(zipPath: string, declaredType: ProjectType): Promise<AnalyzeResult> {
    if (!fs.existsSync(zipPath)) {
      return {
        success: false,
        error: `Zip file not found: ${zipPath}`,
      };
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(zipPath));
    formData.append('type', declaredType);

    try {
      const response = await axios.post(
        `${this.serverUrl}/api/project/analyze`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.token}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 60000, // 1 minute for analysis
        }
      );

      if (response.data.success) {
        return {
          success: true,
          analysis: response.data.data,
        };
      } else {
        return {
          success: false,
          error: response.data.error || 'Analysis failed',
        };
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error || error.message;
        return {
          success: false,
          error: `Analysis failed: ${message}`,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const createUploadService = (): UploadService => {
  return new UploadService();
};
