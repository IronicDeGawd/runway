import fs from 'fs';
import path from 'path';
import { AuthConfig } from '../types/auth';
import { logger } from '../utils/logger';
import { authRepository } from '../repositories';

const DATA_DIR = path.resolve(process.cwd(), '../data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const getAuthConfig = (): AuthConfig | null => {
  // Try SQLite first
  try {
    const config = authRepository.get();
    if (config) {
      return config;
    }
  } catch (error) {
    logger.warn('SQLite auth read failed', error);
  }

  // Fallback to JSON file for initial migration
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const raw = fs.readFileSync(AUTH_FILE, 'utf-8');
      const config = JSON.parse(raw) as AuthConfig;
      // Migrate to SQLite
      try {
        authRepository.set(config);
        logger.info('Auth config migrated to SQLite');
      } catch {
        // Ignore migration errors
      }
      return config;
    } catch (error) {
      logger.error('Failed to read auth config from JSON', error);
    }
  }

  logger.warn('Auth config not found. System may be uninitialized.');
  return null;
};

export const setAuthConfig = (config: AuthConfig): void => {
  authRepository.set(config);
  logger.debug('Auth config saved to SQLite');
};
