import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs';
import chalk from 'chalk';
import { createUploadService } from '../services/uploadService';
import { createEnvService } from '../services/envService';
import { isConfigured, isTokenExpired } from '../utils/config';
import { logger } from '../utils/logger';
import {
  parseEnvFile,
  promptEnvOptions,
  promptManualEnvVars,
  resolveProject,
  displayEnvVars,
  categorizeEnvVars,
} from '../utils/envUtils';

// ─── Auth guard ──────────────────────────────────────────────

function checkAuth(): boolean {
  if (!isConfigured()) {
    logger.error('CLI not configured. Run "runway init" first.');
    return false;
  }
  if (isTokenExpired()) {
    logger.error('Your authentication token has expired.');
    logger.info('Run "runway login" to re-authenticate.');
    return false;
  }
  return true;
}

// ─── env list ────────────────────────────────────────────────

async function envListCommand(project: string | undefined, options: { show?: boolean }): Promise<void> {
  logger.header('Runway Env');

  if (!checkAuth()) return;

  const uploadService = createUploadService();
  const envService = createEnvService();

  const spinner = ora('Fetching projects...').start();
  let projects;
  try {
    projects = await uploadService.listProjects();
    spinner.stop();
  } catch (error) {
    spinner.fail('Failed to fetch projects');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    return;
  }

  const selected = await resolveProject(projects, project);
  if (!selected) return;

  if (selected.type === 'static') {
    logger.warn('Static projects do not support environment variables.');
    return;
  }

  const envSpinner = ora('Fetching environment variables...').start();
  let env: Record<string, string>;
  try {
    env = await envService.getEnv(selected.id);
    envSpinner.stop();
  } catch (error) {
    envSpinner.fail('Failed to fetch environment variables');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    return;
  }

  logger.blank();
  logger.info(`Environment variables for: ${chalk.bold(selected.name)} (${selected.type})`);
  logger.blank();

  displayEnvVars(env, { show: options.show, projectType: selected.type });

  logger.blank();
}

// ─── env set ─────────────────────────────────────────────────

async function envSetCommand(project: string | undefined, options: { envFile?: string }): Promise<void> {
  logger.header('Runway Env Set');

  if (!checkAuth()) return;

  const uploadService = createUploadService();
  const envService = createEnvService();

  const spinner = ora('Fetching projects...').start();
  let projects;
  try {
    projects = await uploadService.listProjects();
    spinner.stop();
  } catch (error) {
    spinner.fail('Failed to fetch projects');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    return;
  }

  const selected = await resolveProject(projects, project);
  if (!selected) return;

  if (selected.type === 'static') {
    logger.warn('Static projects do not support environment variables.');
    return;
  }

  // Check mutability
  try {
    const mutability = await envService.getMutability(selected.id);
    if (!mutability.mutable) {
      logger.warn(`Environment variables cannot be updated: ${mutability.message}`);
      if (selected.type === 'react') {
        logger.dim('React environment variables require a redeploy. Use "runway update --env-file .env" instead.');
      }
      return;
    }
  } catch {
    // Non-fatal — server will reject the POST if truly immutable
  }

  // Fetch current env
  let currentEnv: Record<string, string> = {};
  try {
    const envSpinner = ora('Fetching current environment...').start();
    currentEnv = await envService.getEnv(selected.id);
    const count = Object.keys(currentEnv).length;
    if (count > 0) {
      envSpinner.succeed(`Found ${count} existing variable${count !== 1 ? 's' : ''}`);
      displayEnvVars(currentEnv, { projectType: selected.type });
    } else {
      envSpinner.succeed('No environment variables currently set');
    }
    logger.blank();
  } catch {
    // Non-fatal
  }

  // Determine new vars
  let newVars: Record<string, string> = {};

  if (options.envFile) {
    // --env-file flag provided
    if (!fs.existsSync(options.envFile)) {
      logger.error(`Env file not found: ${options.envFile}`);
      return;
    }
    newVars = parseEnvFile(options.envFile);
    logger.success(`Loaded ${Object.keys(newVars).length} variables from ${options.envFile}`);
  } else {
    // Interactive prompt
    const { envAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'envAction',
        message: 'How would you like to set environment variables?',
        choices: [
          { name: 'Load from .env file', value: 'file' },
          { name: 'Enter manually', value: 'manual' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ]);

    if (envAction === 'cancel') {
      logger.warn('Cancelled.');
      return;
    }

    if (envAction === 'file') {
      const envFilePath = await promptEnvOptions();
      if (!envFilePath) {
        logger.warn('No env file provided.');
        return;
      }
      newVars = parseEnvFile(envFilePath);
    } else {
      newVars = await promptManualEnvVars();
    }
  }

  if (Object.keys(newVars).length === 0) {
    logger.warn('No environment variables to set.');
    return;
  }

  // Merge with current env (new values override existing)
  const mergedVars = { ...currentEnv, ...newVars };

  // Show diff
  logger.blank();
  const currentKeys = new Set(Object.keys(currentEnv));
  const newKeys = Object.keys(newVars);

  const added = newKeys.filter(k => !currentKeys.has(k));
  const changed = newKeys.filter(k => currentKeys.has(k) && currentEnv[k] !== newVars[k]);
  const unchanged = newKeys.filter(k => currentKeys.has(k) && currentEnv[k] === newVars[k]);

  if (added.length > 0) {
    logger.info(`  ${chalk.green('+')} ${added.length} new: ${added.join(', ')}`);
  }
  if (changed.length > 0) {
    logger.info(`  ${chalk.yellow('~')} ${changed.length} changed: ${changed.join(', ')}`);
  }
  if (unchanged.length > 0) {
    logger.dim(`  ${unchanged.length} unchanged`);
  }

  // Show type-specific info
  if (selected.type === 'next') {
    const { buildTime, runtime } = categorizeEnvVars(mergedVars, 'next');
    const btCount = Object.keys(buildTime).length;
    const rtCount = Object.keys(runtime).length;
    if (btCount > 0) {
      logger.blank();
      logger.warn(`${btCount} NEXT_PUBLIC_* var${btCount !== 1 ? 's' : ''} will only take effect after a redeploy (build-time only).`);
      logger.dim(`Runtime vars (${rtCount}) will be applied immediately via PM2 restart.`);
    }
  }

  logger.blank();

  // Confirm
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Apply ${Object.keys(mergedVars).length} environment variables to "${selected.name}"?`,
      default: true,
    },
  ]);

  if (!confirm) {
    logger.warn('Cancelled.');
    return;
  }

  // Push to server
  const setSpinner = ora('Updating environment variables...').start();
  try {
    await envService.setEnv(selected.id, mergedVars);
    setSpinner.succeed('Environment variables updated and applied');

    if (selected.type === 'node' || selected.type === 'next') {
      logger.dim('  Application restarted with new environment.');
    }
  } catch (error) {
    setSpinner.fail('Failed to update environment variables');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
  }

  logger.blank();
}

// ─── env unset ───────────────────────────────────────────────

async function envUnsetCommand(project: string | undefined, keys: string[]): Promise<void> {
  logger.header('Runway Env Unset');

  if (!checkAuth()) return;

  if (keys.length === 0) {
    logger.error('Please specify at least one key to remove.');
    logger.dim('Usage: runway env unset [project] <KEY1> [KEY2] ...');
    return;
  }

  const uploadService = createUploadService();
  const envService = createEnvService();

  const spinner = ora('Fetching projects...').start();
  let projects;
  try {
    projects = await uploadService.listProjects();
    spinner.stop();
  } catch (error) {
    spinner.fail('Failed to fetch projects');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    return;
  }

  const selected = await resolveProject(projects, project);
  if (!selected) return;

  if (selected.type === 'static') {
    logger.warn('Static projects do not support environment variables.');
    return;
  }

  // Fetch current env
  const envSpinner = ora('Fetching current environment...').start();
  let currentEnv: Record<string, string>;
  try {
    currentEnv = await envService.getEnv(selected.id);
    envSpinner.stop();
  } catch (error) {
    envSpinner.fail('Failed to fetch environment variables');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    return;
  }

  // Validate keys
  const currentKeys = new Set(Object.keys(currentEnv));
  const found = keys.filter(k => currentKeys.has(k));
  const notFound = keys.filter(k => !currentKeys.has(k));

  if (notFound.length > 0) {
    logger.warn(`Keys not found (skipping): ${notFound.join(', ')}`);
  }

  if (found.length === 0) {
    logger.warn('No matching keys to remove.');
    return;
  }

  // Show what will be removed
  logger.blank();
  logger.info('Variables to remove:');
  for (const key of found) {
    logger.info(`  ${chalk.red('-')} ${key}`);
  }
  logger.blank();

  // Confirm
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Remove ${found.length} variable${found.length !== 1 ? 's' : ''} from "${selected.name}"?`,
      default: true,
    },
  ]);

  if (!confirm) {
    logger.warn('Cancelled.');
    return;
  }

  // Remove keys and POST reduced set
  const reducedEnv = { ...currentEnv };
  for (const key of found) {
    delete reducedEnv[key];
  }

  const setSpinner = ora('Removing environment variables...').start();
  try {
    await envService.setEnv(selected.id, reducedEnv);
    setSpinner.succeed(`Removed ${found.length} variable${found.length !== 1 ? 's' : ''}`);

    if (selected.type === 'node' || selected.type === 'next') {
      logger.dim('  Application restarted with updated environment.');
    }
  } catch (error) {
    setSpinner.fail('Failed to update environment variables');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
  }

  logger.blank();
}

// ─── Build command tree ──────────────────────────────────────

export function buildEnvCommand(): Command {
  const env = new Command('env')
    .description('Manage environment variables for deployed projects');

  env
    .command('list [project]')
    .description('List environment variables for a project')
    .option('--show', 'Reveal variable values (masked by default)')
    .action(async (project: string | undefined, opts: { show?: boolean }) => {
      await envListCommand(project, opts);
    });

  env
    .command('set [project]')
    .description('Set environment variables for a project')
    .option('-e, --env-file <path>', 'Path to .env file')
    .action(async (project: string | undefined, opts: { envFile?: string }) => {
      await envSetCommand(project, opts);
    });

  env
    .command('unset [project] <keys...>')
    .description('Remove environment variables from a project')
    .action(async (project: string | undefined, keys: string[]) => {
      await envUnsetCommand(project, keys);
    });

  return env;
}
