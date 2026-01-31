import crypto from 'crypto';
import { systemRepository } from '../repositories/systemRepository';
import { logger } from '../utils/logger';

/**
 * RSA Key Manager for CLI Authentication
 *
 * Handles RSA keypair generation, storage, and decryption for
 * secure CLI authentication over HTTP (when HTTPS is not available).
 *
 * WARNING: RSA key exchange over HTTP is vulnerable to MITM attacks.
 * This is a fallback mechanism - always recommend domain configuration.
 */
class RSAKeyManager {
  private publicKey: string | null = null;
  private privateKey: string | null = null;
  private initialized = false;

  /**
   * Initialize RSA keys - load from database or generate new keypair
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Try to load existing keys from database
      const stored = systemRepository.getRSAKeys();

      if (stored) {
        this.publicKey = stored.publicKey;
        this.privateKey = stored.privateKey;
        logger.info('RSA keys loaded from database');
      } else {
        // Generate new keypair
        await this.generateNewKeyPair();
        logger.info('New RSA keypair generated');
      }

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize RSA keys', error);
      throw error;
    }
  }

  /**
   * Generate a new RSA keypair and store in database
   */
  private async generateNewKeyPair(): Promise<void> {
    return new Promise((resolve, reject) => {
      crypto.generateKeyPair(
        'rsa',
        {
          modulusLength: 2048,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
          },
        },
        (err, publicKey, privateKey) => {
          if (err) {
            reject(err);
            return;
          }

          this.publicKey = publicKey;
          this.privateKey = privateKey;

          // Store in database
          systemRepository.setRSAKeys(publicKey, privateKey);

          resolve();
        }
      );
    });
  }

  /**
   * Get the public key for CLI to encrypt credentials
   */
  getPublicKey(): string {
    if (!this.publicKey) {
      throw new Error('RSA keys not initialized');
    }
    return this.publicKey;
  }

  /**
   * Decrypt data encrypted with our public key
   * @param encryptedData Base64-encoded encrypted data
   * @returns Decrypted string
   */
  decrypt(encryptedData: string): string {
    if (!this.privateKey) {
      throw new Error('RSA keys not initialized');
    }

    try {
      const buffer = Buffer.from(encryptedData, 'base64');
      const decrypted = crypto.privateDecrypt(
        {
          key: this.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        buffer
      );
      return decrypted.toString('utf-8');
    } catch (error) {
      logger.error('Failed to decrypt RSA data', error);
      throw new Error('Failed to decrypt credentials');
    }
  }

  /**
   * Rotate RSA keys (generate new keypair)
   * Should be done periodically for security
   */
  async rotateKeys(): Promise<void> {
    await this.generateNewKeyPair();
    logger.info('RSA keys rotated successfully');
  }

  /**
   * Check if RSA keys are initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.publicKey !== null && this.privateKey !== null;
  }
}

export const rsaKeyManager = new RSAKeyManager();
