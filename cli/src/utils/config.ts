import fs from 'fs';
import path from 'path';
import os from 'os';

export interface CLIConfig {
  serverUrl?: string;
  token?: string;
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
