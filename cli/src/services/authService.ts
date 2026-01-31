import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger';

export type SecurityMode = 'ip-http' | 'domain-https';

export interface SecurityModeResponse {
  success: boolean;
  data: {
    securityMode: SecurityMode;
    serverIp: string | null;
    domain: string | null;
    domainActive: boolean;
    requiresRSA: boolean;
    tokenMaxAge: number;
    tokenType: 'pairing' | 'standard';
  };
}

export interface PublicKeyResponse {
  success: boolean;
  data: {
    publicKey: string;
  };
  warning?: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    token: string;
    expiresIn: number;
    expiresAt: string;
    tokenType: 'pairing' | 'standard';
    securityMode: SecurityMode;
  };
}

/**
 * CLI Authentication Service
 *
 * Handles authentication flow for both HTTP (RSA) and HTTPS (direct) modes.
 */
export class AuthService {
  private serverUrl: string;

  constructor(serverUrl: string) {
    // Normalize URL
    this.serverUrl = serverUrl.replace(/\/+$/, '');
  }

  /**
   * Get server security mode and connection info
   */
  async getSecurityMode(): Promise<SecurityModeResponse['data']> {
    try {
      const response = await axios.get<SecurityModeResponse>(
        `${this.serverUrl}/api/cli/security-mode`,
        { timeout: 10000 }
      );
      return response.data.data;
    } catch (error) {
      this.handleError(error, 'Failed to get security mode');
      throw error;
    }
  }

  /**
   * Authenticate with the server
   * Automatically handles RSA or direct auth based on security mode
   */
  async authenticate(username: string, password: string): Promise<AuthResponse['data']> {
    const modeInfo = await this.getSecurityMode();

    if (modeInfo.requiresRSA) {
      return this.authenticateWithRSA(username, password);
    } else {
      return this.authenticateDirect(username, password);
    }
  }

  /**
   * RSA-encrypted authentication (HTTP mode)
   */
  private async authenticateWithRSA(
    username: string,
    password: string
  ): Promise<AuthResponse['data']> {
    // Show MITM warning
    logger.blank();
    logger.warn('WARNING: Using RSA key exchange over HTTP');
    logger.warn('This method is vulnerable to man-in-the-middle attacks.');
    logger.warn('Configure a domain on your server for secure authentication.');
    logger.blank();

    // Fetch public key
    let publicKey: string;
    try {
      const keyResponse = await axios.get<PublicKeyResponse>(
        `${this.serverUrl}/api/cli/public-key`,
        { timeout: 10000 }
      );
      publicKey = keyResponse.data.data.publicKey;
    } catch (error) {
      this.handleError(error, 'Failed to fetch RSA public key');
      throw error;
    }

    // Encrypt credentials
    const credentials = JSON.stringify({ username, password });
    let encrypted: string;

    try {
      const encryptedBuffer = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(credentials)
      );
      encrypted = encryptedBuffer.toString('base64');
    } catch (error) {
      logger.error('Failed to encrypt credentials');
      throw new Error('Encryption failed');
    }

    // Send encrypted credentials
    try {
      const authResponse = await axios.post<AuthResponse>(
        `${this.serverUrl}/api/cli/auth`,
        { encryptedCredentials: encrypted },
        { timeout: 10000 }
      );

      const data = authResponse.data.data;
      logger.info(`Token expires in ${Math.round(data.expiresIn / 60000)} minutes`);
      logger.warn('Short token lifetime due to HTTP mode. Re-authenticate as needed.');

      return data;
    } catch (error) {
      this.handleError(error, 'Authentication failed');
      throw error;
    }
  }

  /**
   * Direct authentication (HTTPS mode)
   */
  private async authenticateDirect(
    username: string,
    password: string
  ): Promise<AuthResponse['data']> {
    try {
      const response = await axios.post<AuthResponse>(
        `${this.serverUrl}/api/cli/auth`,
        { username, password },
        { timeout: 10000 }
      );

      const data = response.data.data;
      const hours = Math.round(data.expiresIn / 3600000);
      logger.success(`Authenticated successfully`);
      logger.info(`Token expires in ${hours} hours`);

      return data;
    } catch (error) {
      this.handleError(error, 'Authentication failed');
      throw error;
    }
  }

  /**
   * Refresh token (only works in HTTPS mode)
   */
  async refreshToken(currentToken: string): Promise<AuthResponse['data'] | null> {
    try {
      const response = await axios.post<AuthResponse>(
        `${this.serverUrl}/api/cli/refresh`,
        {},
        {
          timeout: 10000,
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }
      );

      logger.success('Token refreshed successfully');
      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 400) {
          // Token refresh not available (HTTP mode)
          logger.warn('Token refresh not available. Please re-authenticate.');
          return null;
        }
        if (status === 401) {
          logger.warn('Token expired. Please re-authenticate.');
          return null;
        }
      }
      logger.error('Failed to refresh token');
      return null;
    }
  }

  /**
   * Handle axios errors with user-friendly messages
   */
  private handleError(error: unknown, context: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>;
      const message =
        axiosError.response?.data?.error ||
        axiosError.response?.data?.message ||
        axiosError.message;
      logger.error(`${context}: ${message}`);
    } else if (error instanceof Error) {
      logger.error(`${context}: ${error.message}`);
    } else {
      logger.error(`${context}: Unknown error`);
    }
  }
}
