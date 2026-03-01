import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { ProjectType } from '../types';
import { logger } from './logger';

export interface EnvCategories {
  buildTime: Record<string, string>;
  runtime: Record<string, string>;
}

export interface ProjectItem {
  id: string;
  name: string;
  type: ProjectType;
  status: string;
}

/**
 * Parse a .env file into a Record
 */
export function parseEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const vars: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      vars[key] = value;
    }
  }

  return vars;
}

/**
 * Prompt user for manual ENV variable entry
 */
export async function promptManualEnvVars(): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};

  logger.dim('Enter environment variables (empty name to finish):');

  while (true) {
    const { key } = await inquirer.prompt([
      {
        type: 'input',
        name: 'key',
        message: 'Variable name:',
      },
    ]);

    if (!key || !key.trim()) {
      break;
    }

    const { value } = await inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message: `Value for ${key}:`,
      },
    ]);

    vars[key.toUpperCase().replace(/[^A-Z0-9_]/g, '')] = value;
  }

  return vars;
}

/**
 * Prompt user for environment variable options when no .env file exists
 */
export async function promptEnvOptions(): Promise<string | undefined> {
  const { envChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'envChoice',
      message: 'How would you like to provide environment variables?',
      choices: [
        { name: 'Specify path to .env file', value: 'path' },
        { name: 'Enter variables manually (creates .env)', value: 'manual' },
        { name: 'Continue without environment variables', value: 'skip' },
      ],
    },
  ]);

  if (envChoice === 'path') {
    const { envPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'envPath',
        message: 'Path to env file:',
        validate: (input: string) => {
          if (!input.trim()) return 'Please enter a path';
          if (!fs.existsSync(input)) return 'File not found';
          return true;
        },
      },
    ]);
    logger.success(`Using env file: ${envPath}`);
    return envPath;
  }

  if (envChoice === 'manual') {
    const vars = await promptManualEnvVars();
    if (Object.keys(vars).length > 0) {
      const envContent = Object.entries(vars)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      const envPath = path.join(process.cwd(), '.env');
      fs.writeFileSync(envPath, envContent);
      logger.success(`Created .env with ${Object.keys(vars).length} variables`);
      return envPath;
    }
  }

  return undefined;
}

/**
 * Categorize env vars into build-time and runtime based on project type
 */
export function categorizeEnvVars(
  vars: Record<string, string>,
  projectType: ProjectType
): EnvCategories {
  if (projectType === 'react') {
    return { buildTime: vars, runtime: {} };
  }
  if (projectType === 'node') {
    return { buildTime: {}, runtime: vars };
  }
  if (projectType === 'next') {
    const buildTime: Record<string, string> = {};
    const runtime: Record<string, string> = {};
    for (const [key, value] of Object.entries(vars)) {
      if (key.startsWith('NEXT_PUBLIC_')) {
        buildTime[key] = value;
      } else {
        runtime[key] = value;
      }
    }
    return { buildTime, runtime };
  }
  // static
  return { buildTime: {}, runtime: {} };
}

/**
 * Resolve a project by name or show interactive picker
 */
export async function resolveProject(
  projects: ProjectItem[],
  nameOrUndefined?: string
): Promise<ProjectItem | undefined> {
  if (projects.length === 0) {
    logger.warn('No projects deployed. Use "runway deploy" to deploy a new project.');
    return undefined;
  }

  if (nameOrUndefined) {
    const match = projects.find(
      p => p.name === nameOrUndefined || p.name.toLowerCase() === nameOrUndefined.toLowerCase()
    );
    if (!match) {
      logger.error(`Project "${nameOrUndefined}" not found.`);
      logger.dim('Available projects:');
      for (const p of projects) {
        logger.dim(`  ${p.name} (${p.type})`);
      }
      return undefined;
    }
    return match;
  }

  const { selectedProject } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedProject',
      message: 'Select project:',
      choices: projects.map(p => ({
        name: `${p.name} (${p.type}) — ${p.status}`,
        value: p,
      })),
    },
  ]);

  return selectedProject;
}

/**
 * Display env vars in a formatted table
 */
export function displayEnvVars(
  vars: Record<string, string>,
  options: { show?: boolean; projectType?: ProjectType } = {}
): void {
  const entries = Object.entries(vars);

  if (entries.length === 0) {
    logger.dim('  No environment variables set.');
    return;
  }

  const maxKeyLen = Math.max(...entries.map(([k]) => k.length));

  for (const [key, value] of entries) {
    const paddedKey = key.padEnd(maxKeyLen);
    const displayValue = options.show ? value : '***';
    console.log(`  ${chalk.cyan(paddedKey)}  ${chalk.dim(displayValue)}`);
  }

  logger.blank();
  logger.dim(`  ${entries.length} variable${entries.length !== 1 ? 's' : ''}${options.show ? '' : '  |  use --show to reveal values'}`);

  if (options.projectType === 'next') {
    const publicCount = entries.filter(([k]) => k.startsWith('NEXT_PUBLIC_')).length;
    const runtimeCount = entries.length - publicCount;
    if (publicCount > 0 || runtimeCount > 0) {
      logger.dim(`  ${publicCount} build-time (NEXT_PUBLIC_*), ${runtimeCount} runtime`);
    }
  } else if (options.projectType === 'react') {
    logger.dim('  All vars are build-time only (baked into bundle)');
  } else if (options.projectType === 'node') {
    logger.dim('  All vars are runtime (injected via PM2)');
  }
}

/**
 * Show categorization summary for env vars
 */
export function showEnvSummary(
  vars: Record<string, string>,
  projectType: ProjectType
): void {
  const { buildTime, runtime } = categorizeEnvVars(vars, projectType);
  const btCount = Object.keys(buildTime).length;
  const rtCount = Object.keys(runtime).length;

  if (btCount > 0 && rtCount > 0) {
    logger.info(`Environment: ${btCount} build-time, ${rtCount} runtime vars`);
  } else if (btCount > 0) {
    logger.info(`Environment: ${btCount} build-time vars`);
  } else if (rtCount > 0) {
    logger.info(`Environment: ${rtCount} runtime vars`);
  }
}
