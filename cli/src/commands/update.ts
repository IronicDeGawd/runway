import inquirer from 'inquirer';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { ProjectType } from '../types';
import { detectProject } from '../services/projectDetector';
import { buildService } from '../services/buildService';
import { packageService } from '../services/packageService';
import { createUploadService } from '../services/uploadService';
import { createEnvService } from '../services/envService';
import { isConfigured, getConfig, isTokenExpired } from '../utils/config';
import { logger } from '../utils/logger';
import { parseEnvFile, promptEnvOptions, categorizeEnvVars, displayEnvVars, showEnvSummary } from '../utils/envUtils';

interface UpdateOptions {
  envFile?: string;
}

export async function updateCommand(options: UpdateOptions): Promise<void> {
  logger.header('Runway Update');

  // Check configuration
  if (!isConfigured()) {
    logger.error('CLI not configured. Run "runway init" first.');
    return;
  }

  // Check token validity
  if (isTokenExpired()) {
    logger.error('Your authentication token has expired.');
    logger.info('Run "runway login" to re-authenticate.');
    return;
  }

  const config = getConfig();
  logger.dim(`Server: ${config.serverUrl}`);
  logger.blank();

  // Fetch list of deployed projects
  let uploadService;
  try {
    uploadService = createUploadService();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    return;
  }

  const spinner = ora('Fetching deployed projects...').start();
  let projects;
  try {
    projects = await uploadService.listProjects();
    spinner.succeed(`Found ${projects.length} deployed projects`);
  } catch (error) {
    spinner.fail('Failed to fetch projects');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    return;
  }

  if (projects.length === 0) {
    logger.warn('No projects deployed. Use "runway deploy" to deploy a new project.');
    return;
  }

  // Let user pick a project
  const { selectedProject } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedProject',
      message: 'Select project to update:',
      choices: projects.map(p => ({
        name: `${p.name} (${p.type}) — ${p.status}`,
        value: p,
      })),
    },
  ]);

  const projectName = selectedProject.name;
  const projectId = selectedProject.id;
  const projectType: ProjectType = selectedProject.type;

  logger.blank();
  logger.info(`Updating: ${projectName} (${projectType})`);
  logger.blank();

  // Detect current directory project
  const detectedSpinner = ora('Detecting local project...').start();
  let detectedProject;
  try {
    detectedProject = await detectProject();
    detectedSpinner.succeed(`Detected: ${detectedProject.type} project (${detectedProject.packageManager})`);
  } catch (error) {
    detectedSpinner.fail('Failed to detect project in current directory');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    return;
  }

  // Environment variable handling
  let envFilePath: string | undefined = options.envFile;
  let envVars: Record<string, string> = {};
  let envInjected = false;

  // Skip env handling for static projects
  if (projectType !== 'static') {
    // Fetch current env vars from server
    let currentEnv: Record<string, string> = {};
    try {
      const envService = createEnvService();
      const envSpinner = ora('Checking current environment...').start();
      currentEnv = await envService.getEnv(projectId);
      const count = Object.keys(currentEnv).length;
      if (count > 0) {
        envSpinner.succeed(`Found ${count} environment variable${count !== 1 ? 's' : ''} on server`);
        displayEnvVars(currentEnv, { projectType });
      } else {
        envSpinner.succeed('No environment variables currently set');
      }
      logger.blank();
    } catch {
      // Non-fatal — continue without current env info
    }

    if (envFilePath) {
      // --env-file flag provided — use it directly
      if (!fs.existsSync(envFilePath)) {
        logger.error(`Env file not found: ${envFilePath}`);
        return;
      }
      envVars = parseEnvFile(envFilePath);
      envInjected = Object.keys(envVars).length > 0;
      logger.success(`Loaded ${Object.keys(envVars).length} variables from ${envFilePath}`);
      showEnvSummary(envVars, projectType);
      logger.blank();
    } else {
      // Interactive env prompt
      const hasCurrentEnv = Object.keys(currentEnv).length > 0;

      const { envAction } = await inquirer.prompt([
        {
          type: 'list',
          name: 'envAction',
          message: 'Update environment variables?',
          choices: [
            ...(hasCurrentEnv ? [{ name: 'Keep existing (no changes)', value: 'keep' }] : []),
            { name: 'Update from .env file', value: 'file' },
            { name: 'Enter manually', value: 'manual' },
            { name: hasCurrentEnv ? 'Clear all variables' : 'Skip (no env vars)', value: 'skip' },
          ],
        },
      ]);

      if (envAction === 'file') {
        const defaultEnvPath = path.join(process.cwd(), '.env');
        const hasEnvFile = fs.existsSync(defaultEnvPath);

        if (hasEnvFile) {
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
          } else {
            envFilePath = await promptEnvOptions();
          }
        } else {
          envFilePath = await promptEnvOptions();
        }

        if (envFilePath) {
          envVars = parseEnvFile(envFilePath);
          envInjected = Object.keys(envVars).length > 0;
          if (envInjected) {
            showEnvSummary(envVars, projectType);
          }
        }
      } else if (envAction === 'manual') {
        const { promptManualEnvVars } = await import('../utils/envUtils');
        envVars = await promptManualEnvVars();
        envInjected = Object.keys(envVars).length > 0;
        if (envInjected) {
          // Write to temp file for buildService
          const envContent = Object.entries(envVars)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');
          envFilePath = path.join(process.cwd(), '.env.runway-tmp');
          fs.writeFileSync(envFilePath, envContent);
          showEnvSummary(envVars, projectType);
        }
      } else if (envAction === 'keep') {
        // Keep existing — pass current env to build for build-time vars
        if (Object.keys(currentEnv).length > 0) {
          envVars = currentEnv;
          envInjected = true;
          // Write current env to temp file for buildService
          const envContent = Object.entries(currentEnv)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');
          envFilePath = path.join(process.cwd(), '.env.runway-tmp');
          fs.writeFileSync(envFilePath, envContent);
        }
      }
      // 'skip' / 'clear' — envVars stays empty, envInjected stays false
    }
  }

  // Confirm
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Build current directory and update "${projectName}"?`,
      default: true,
    },
  ]);

  if (!confirm) {
    cleanupTempEnvFile(envFilePath);
    logger.warn('Update cancelled.');
    return;
  }

  logger.blank();

  // Step 1: Build locally
  logger.step(1, 3, 'Building project...');

  // Patch framework configs before build (inject basePath for subpath routing)
  let didPatchReact = false;
  let didPatchNext = false;

  if (projectType === 'react') {
    const { ReactPatcher } = await import('../services/reactPatcher');
    didPatchReact = await ReactPatcher.patch(process.cwd());
  } else if (projectType === 'next') {
    const { NextPatcher } = await import('../services/nextPatcher');
    didPatchNext = await NextPatcher.patch(process.cwd(), projectName);
  }

  let buildResult;
  try {
    buildResult = await buildService.build({
      projectPath: process.cwd(),
      projectType,
      projectName,
      packageManager: detectedProject.packageManager,
      envFile: envFilePath,
    });
  } finally {
    // Revert React patch after build (static assets don't need config at runtime)
    if (didPatchReact) {
      const { ReactPatcher } = await import('../services/reactPatcher');
      await ReactPatcher.revert(process.cwd());
    }
    // Next.js patch is reverted after packaging — next start needs basePath in config at runtime
  }

  if (!buildResult.success) {
    cleanupTempEnvFile(envFilePath);
    logger.error(`Build failed: ${buildResult.error}`);
    return;
  }

  logger.success(`Build completed in ${(buildResult.duration / 1000).toFixed(1)}s`);
  logger.blank();

  // Step 2: Package
  logger.step(2, 3, 'Creating deployment package...');

  let packageResult;
  try {
    packageResult = await packageService.package({
      projectPath: process.cwd(),
      projectType,
      buildOutputDir: buildResult.outputDir,
      includeSource: false,
      envFile: projectType === 'node' ? envFilePath : undefined,
    });
  } catch (error) {
    logger.error(`Packaging failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    cleanupTempEnvFile(envFilePath);
    return;
  } finally {
    // Revert Next.js patch after packaging (config is included in zip with basePath intact)
    if (didPatchNext) {
      const { NextPatcher } = await import('../services/nextPatcher');
      await NextPatcher.revert(process.cwd());
    }
  }

  // Cleanup temp env file
  cleanupTempEnvFile(envFilePath);

  logger.blank();

  // Step 3: Upload as update
  logger.step(3, 3, 'Uploading update to server...');

  const uploadResult = await uploadService.upload({
    zipPath: packageResult.zipPath,
    projectName,
    projectType,
    buildMode: 'local',
    deploymentSource: 'cli',
    envInjected,
  });

  // Cleanup
  packageService.cleanup(packageResult.zipPath);

  if (!uploadResult.success) {
    logger.error(`Upload failed: ${uploadResult.error}`);
    return;
  }

  logger.success('Upload complete');

  // Push runtime env vars to server for Next.js/Node.js
  if (envInjected && (projectType === 'next' || projectType === 'node')) {
    const { runtime } = categorizeEnvVars(envVars, projectType);
    if (Object.keys(runtime).length > 0) {
      const targetId = uploadResult.projectId || projectId;
      try {
        const envService = createEnvService();
        await envService.setEnv(targetId, runtime);
        logger.success(`Pushed ${Object.keys(runtime).length} runtime env vars to server`);
      } catch (error) {
        logger.warn(`Could not push runtime env vars: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  logger.blank();

  // Wait for deployment
  if (uploadResult.deploymentId) {
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
        logger.success(`"${projectName}" updated successfully!`);

        const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');

        // Fetch domain config to show proper URL (same pattern as deploy.ts)
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

        // Show health warning if service didn't respond on its allocated port
        if (finalStatus.healthWarning) {
          logger.blank();
          logger.warn(`Health check: ${finalStatus.healthWarning}`);
        }
      } else {
        logger.error(`Update failed: ${finalStatus.error || 'Unknown error'}`);
        if (finalStatus.logs) {
          logger.blank();
          logger.dim('Logs:');
          console.log(finalStatus.logs);
        }
      }
    } catch {
      logger.warn('Could not track deployment status. Check the web UI.');
    }
  } else {
    // No deploymentId means synchronous deploy (prebuilt) — already complete
    logger.blank();
    logger.success(`"${projectName}" updated successfully!`);

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

function cleanupTempEnvFile(envFilePath: string | undefined): void {
  if (envFilePath && envFilePath.endsWith('.env.runway-tmp')) {
    try {
      fs.unlinkSync(envFilePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
