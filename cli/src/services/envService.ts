import axios from 'axios';
import { getConfig } from '../utils/config';

export interface MutabilityResult {
  mutable: boolean;
  reason?: string;
  message?: string;
}

export class EnvService {
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

  async getEnv(projectId: string): Promise<Record<string, string>> {
    try {
      const response = await axios.get(
        `${this.serverUrl}/api/env/${projectId}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
          timeout: 10000,
        }
      );
      return response.data.data || {};
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.error || error.message);
      }
      throw error;
    }
  }

  async getMutability(projectId: string): Promise<MutabilityResult> {
    try {
      const response = await axios.get(
        `${this.serverUrl}/api/env/${projectId}/mutability`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
          timeout: 10000,
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

  async setEnv(projectId: string, env: Record<string, string>): Promise<void> {
    try {
      const response = await axios.post(
        `${this.serverUrl}/api/env/${projectId}`,
        { env },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update environment variables');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data;
        if (data?.reason) {
          throw new Error(`${data.error} (${data.reason})`);
        }
        throw new Error(data?.error || error.message);
      }
      throw error;
    }
  }
}

export const createEnvService = (): EnvService => new EnvService();
