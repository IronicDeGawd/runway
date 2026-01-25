import fs from 'fs';
import path from 'path';
import { AuthConfig } from '../types/auth';
import { logger } from '../utils/logger';

const DATA_DIR = path.resolve(process.cwd(), '../data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const getAuthConfig = (): AuthConfig | null => {
  if (!fs.existsSync(AUTH_FILE)) {
    logger.warn('Auth file not found. System may be uninitialized.');
    return null;
  }

  try {
    const raw = fs.readFileSync(AUTH_FILE, 'utf-8');
    return JSON.parse(raw) as AuthConfig;
  } catch (error) {
    logger.error('Failed to read auth config', error);
    return null;
  }
};
