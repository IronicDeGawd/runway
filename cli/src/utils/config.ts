import fs from 'fs';
import path from 'path';
import os from 'os';

export type SecurityMode = 'ip-http' | 'domain-https';

export interface CLIConfig {
  serverUrl?: string;
  token?: string;
  tokenExpiresAt?: string;
  securityMode?: SecurityMode;
  defaultBuildMode?: 'local' | 'server';
}

const CONFIG_DIR = path.join(os.homedir(), '.runway');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const ensureConfigDir = (): void => {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
};

const readConfig = (): CLIConfig => {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { defaultBuildMode: 'local' };
  }
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { defaultBuildMode: 'local' };
  }
};

const writeConfig = (config: CLIConfig): void => {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
};

export const getConfig = (): CLIConfig => {
  return readConfig();
};

export const setServerUrl = (url: string): void => {
  const config = readConfig();
  config.serverUrl = url;
  writeConfig(config);
};

export const setToken = (token: string): void => {
  const config = readConfig();
  config.token = token;
  writeConfig(config);
};

export const setDefaultBuildMode = (mode: 'local' | 'server'): void => {
  const config = readConfig();
  config.defaultBuildMode = mode;
  writeConfig(config);
};

export const clearConfig = (): void => {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
};

export const isConfigured = (): boolean => {
  const cfg = getConfig();
  return !!(cfg.serverUrl && cfg.token);
};

export const setSecurityMode = (mode: SecurityMode): void => {
  const config = readConfig();
  config.securityMode = mode;
  writeConfig(config);
};

export const setTokenExpiresAt = (expiresAt: string): void => {
  const config = readConfig();
  config.tokenExpiresAt = expiresAt;
  writeConfig(config);
};

export const setAuthData = (
  token: string,
  expiresAt: string,
  securityMode: SecurityMode
): void => {
  const config = readConfig();
  config.token = token;
  config.tokenExpiresAt = expiresAt;
  config.securityMode = securityMode;
  writeConfig(config);
};

export const isTokenExpired = (): boolean => {
  const config = getConfig();
  if (!config.tokenExpiresAt) return true;
  return new Date(config.tokenExpiresAt) < new Date();
};

export const getTokenTimeRemaining = (): number => {
  const config = getConfig();
  if (!config.tokenExpiresAt) return 0;
  const remaining = new Date(config.tokenExpiresAt).getTime() - Date.now();
  return Math.max(0, remaining);
};
