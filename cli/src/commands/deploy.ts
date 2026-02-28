import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { ProjectType, BuildMode } from '../types';
import { detectProject } from '../services/projectDetector';
import { buildService } from '../services/buildService';
import { packageService } from '../services/packageService';
import { createUploadService } from '../services/uploadService';
import { isConfigured, getConfig, isTokenExpired } from '../utils/config';
import { logger } from '../utils/logger';

interface DeployOptions {
  name?: string;
  type?: ProjectType;
  version?: string;
  buildLocal?: boolean;
  buildServer?: boolean;
  envFile?: string;
  skipEnvPrompt?: boolean;
}

/**
 * Parse a .env file into a Record
 */
function parseEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const vars: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Remove surrounding quotes if present
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
async function promptManualEnvVars(): Promise<Record<string, string>> {
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
async function promptEnvOptions(): Promise<string | undefined> {
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
      // Write to .env file in project
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

export async function deployCommand(options: DeployOptions): Promise<void> {
  logger.header('Runway Deploy');

  // Check configuration
  if (!isConfigured()) {
    logger.error('CLI not configured. Run "runway init" first.');
    return;
  }

  // Check token validity before proceeding
  if (isTokenExpired()) {
    logger.error('Your authentication token has expired.');
    logger.info('Run "runway login" to re-authenticate.');
    return;
  }

  const config = getConfig();
  logger.dim(`Server: ${config.serverUrl}`);
  logger.blank();

  // Detect project
  const spinner = ora('Detecting project...').start();
  let detectedProject;

  try {
    detectedProject = await detectProject();
    spinner.succeed(`Detected: ${detectedProject.type} project (${detectedProject.packageManager})`);
  } catch (error) {
    spinner.fail('Failed to detect project');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    return;
  }

  // Determine project name — sanitize from package.json
  const suggestedName = (detectedProject.name || path.basename(process.cwd()))
    .replace(/^@[^/]+\//, '')        // Remove npm scope (@scope/name → name)
    .replace(/[^a-zA-Z0-9-_]/g, '-')  // Replace invalid chars with hyphens
    .replace(/^-+|-+$/g, '')          // Trim leading/trailing hyphens
    .toLowerCase();
  let projectName = options.name || suggestedName;

  // Interactive mode if name not provided
  if (!options.name) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: projectName,
        validate: (input: string) => {
          if (input.length < 2) return 'Name must be at least 2 characters';
          if (!/^[a-zA-Z0-9-_]+$/.test(input)) return 'Name can only contain letters, numbers, hyphens, and underscores';
          return true;
        },
      },
    ]);
    projectName = answers.name;
  }

  // Ask if environment variables are required
  const { needsEnv } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'needsEnv',
      message: 'Does this project require environment variables?',
      default: false,
    },
  ]);

  let envFilePath: string | undefined;
  let envVars: Record<string, string> = {};
  let envInjected = false;

  if (needsEnv) {
    const defaultEnvPath = path.join(process.cwd(), '.env');
    const hasEnvFile = fs.existsSync(defaultEnvPath);

    if (hasEnvFile) {
      // .env found - confirm with user
      const { useExisting } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useExisting',
          message: 'Found .env file in project. Use it?',
          default: true,
        },
      ]);

      if (useExisting) {
        envFilePath = defaultEnvPath;
        envVars = parseEnvFile(defaultEnvPath);
        envInjected = Object.keys(envVars).length > 0;
        logger.success(`Loaded ${Object.keys(envVars).length} variables from .env`);
      } else {
        // User declined existing .env - show other options
        envFilePath = await promptEnvOptions();
        if (envFilePath) {
          envVars = parseEnvFile(envFilePath);
          envInjected = Object.keys(envVars).length > 0;
        }
      }
    } else {
      // No .env found - show options
      logger.warn('No .env file found in project directory.');
      envFilePath = await promptEnvOptions();
      if (envFilePath) {
        envVars = parseEnvFile(envFilePath);
        envInjected = Object.keys(envVars).length > 0;
      }
    }
  }

  // Determine project type
  const projectType = options.type || detectedProject.type;

  // Determine build mode
  let buildMode: BuildMode;
  if (options.buildServer) {
    buildMode = 'server';
  } else if (options.buildLocal) {
    buildMode = 'local';
  } else {
    buildMode = config.defaultBuildMode || 'local';
  }

  logger.blank();
  logger.info(`Project: ${projectName}`);
  logger.info(`Type: ${projectType}`);
  logger.info(`Build mode: ${buildMode}`);
  if (options.version) {
    logger.info(`Version: ${options.version}`);
  }
  logger.blank();

  // Confirm deployment
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Proceed with deployment?',
      default: true,
    },
  ]);

  if (!confirm) {
    logger.warn('Deployment cancelled.');
    return;
  }

  logger.blank();

  // Step 1: Build (for local-build mode)
  let buildOutputDir = detectedProject.buildOutputDir;

  if (buildMode === 'local') {
    logger.step(1, 4, 'Building project...');

    // Patch React Router basename before build (if applicable)
    let didPatch = false;
    if (projectType === 'react') {
      const { ReactPatcher } = await import('../services/reactPatcher');
      didPatch = await ReactPatcher.patch(process.cwd());
    }

    const buildResult = await buildService.build({
      projectPath: process.cwd(),
      projectType,
      projectName,
      packageManager: detectedProject.packageManager,
      envFile: envFilePath,
    });

    // Revert patch after build (keep user's source clean)
    if (didPatch) {
      const { ReactPatcher } = await import('../services/reactPatcher');
      await ReactPatcher.revert(process.cwd());
    }

    if (!buildResult.success) {
      logger.error(`Build failed: ${buildResult.error}`);
      return;
    }

    buildOutputDir = buildResult.outputDir;
    logger.success(`Build completed in ${(buildResult.duration / 1000).toFixed(1)}s`);
    logger.blank();
  }

  // Step 2: Package
  const packageStep = buildMode === 'local' ? 2 : 1;
  const totalSteps = buildMode === 'local' ? 4 : 3;

  logger.step(packageStep, totalSteps, 'Creating deployment package...');

  let packageResult;
  try {
    packageResult = await packageService.package({
      projectPath: process.cwd(),
      projectType,
      buildOutputDir,
      includeSource: buildMode === 'server',
      envFile: projectType === 'node' ? envFilePath : undefined,
    });
  } catch (error) {
    logger.error(`Packaging failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return;
  }

  logger.blank();

  // Step 3: Analyze & Upload
  logger.step(packageStep + 1, totalSteps, 'Analyzing and uploading to server...');

  let uploadService;
  try {
    uploadService = createUploadService();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    packageService.cleanup(packageResult.zipPath);
    return;
  }

  // Analyze package first (for server-build mode to get warnings)
  let confirmServerBuild = false;
  if (buildMode === 'server') {
    const analyzeResult = await uploadService.analyzePackage(packageResult.zipPath, projectType);

    if (analyzeResult.success && analyzeResult.analysis) {
      const analysis = analyzeResult.analysis;

      // Display warnings
      if (analysis.warnings && analysis.warnings.length > 0) {
        logger.blank();
        logger.warn('Server Analysis:');
        for (const warning of analysis.warnings) {
          const prefix = warning.level === 'critical' ? '❌' : warning.level === 'warning' ? '⚠️' : 'ℹ️';
          logger.dim(`  ${prefix} ${warning.message}`);
        }
        logger.blank();
      }

      // Handle confirmation for server-side build
      if (analysis.requiresConfirmation) {
        const { confirmBuild } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmBuild',
            message: `${analysis.confirmationReason || 'Server-side build required'}. This may consume significant resources. Continue?`,
            default: true,
          },
        ]);

        if (!confirmBuild) {
          logger.warn('Deployment cancelled by user.');
          packageService.cleanup(packageResult.zipPath);
          return;
        }
        confirmServerBuild = true;
      }
    }
  }

  const uploadResult = await uploadService.upload({
    zipPath: packageResult.zipPath,
    projectName,
    projectType,
    version: options.version,
    buildMode,
    confirmServerBuild,
    // ENV mutability tracking
    deploymentSource: 'cli',
    envInjected,
  });

  // Cleanup zip file
  packageService.cleanup(packageResult.zipPath);

  if (!uploadResult.success) {
    logger.error(`Upload failed: ${uploadResult.error}`);
    return;
  }

  logger.success('Upload complete');
  logger.blank();

  // Step 4: Wait for deployment (if deployment ID available)
  if (uploadResult.deploymentId) {
    logger.step(packageStep + 2, totalSteps, 'Waiting for deployment to complete...');

    try {
      const finalStatus = await uploadService.pollDeploymentStatus(
        uploadResult.deploymentId,
        (status) => {
          if (status.progress !== undefined) {
            process.stdout.write(`\r  Progress: ${status.progress}%`);
          }
        }
      );

      process.stdout.write('\n');

      if (finalStatus.status === 'success') {
        logger.blank();
        logger.success('Deployment successful!');

        const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');

        // Fetch domain config to show proper URL
        try {
          const domainResponse = await axios.get(`${config.serverUrl}/api/domain`, {
            headers: config.token ? { Authorization: `Bearer ${config.token}` } : {},
          });
          const domainConfig = domainResponse.data;

          if (domainConfig.domain?.active && domainConfig.securityMode === 'domain-https') {
            logger.blank();
            logger.info(`Your app is available at: https://${domainConfig.domain.domain}/app/${safeName}`);
          } else {
            logger.blank();
            logger.info(`Your app is available at: ${config.serverUrl}/app/${safeName}`);
          }
        } catch {
          // Fallback to server URL if domain fetch fails
          logger.blank();
          logger.info(`Your app is available at: ${config.serverUrl}/app/${safeName}`);
        }

        // Show health warning if service didn't respond on its allocated port
        if (finalStatus.healthWarning) {
          logger.blank();
          logger.warn(`⚠  Health check: ${finalStatus.healthWarning}`);
        }
      } else {
        logger.error(`Deployment failed: ${finalStatus.error || 'Unknown error'}`);
        if (finalStatus.logs) {
          logger.blank();
          logger.dim('Logs:');
          console.log(finalStatus.logs);
        }
      }
    } catch (error) {
      logger.warn('Could not track deployment status');
      logger.dim('Check the web UI for deployment status');
    }
  } else {
    // No deploymentId means synchronous deploy (prebuilt) — already complete
    logger.blank();
    logger.success('Deployment successful!');

    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');

    try {
      const domainResponse = await axios.get(`${config.serverUrl}/api/domain`, {
        headers: config.token ? { Authorization: `Bearer ${config.token}` } : {},
      });
      const domainConfig = domainResponse.data;

      if (domainConfig.domain?.active && domainConfig.securityMode === 'domain-https') {
        logger.info(`Your app is available at: https://${domainConfig.domain.domain}/app/${safeName}`);
      } else {
        logger.info(`Your app is available at: ${config.serverUrl}/app/${safeName}`);
      }
    } catch {
      logger.info(`Your app is available at: ${config.serverUrl}/app/${safeName}`);
    }
  }

  logger.blank();
}
