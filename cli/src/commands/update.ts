import inquirer from 'inquirer';
import ora from 'ora';
import path from 'path';
import axios from 'axios';
import { ProjectType } from '../types';
import { detectProject } from '../services/projectDetector';
import { buildService } from '../services/buildService';
import { packageService } from '../services/packageService';
import { createUploadService } from '../services/uploadService';
import { isConfigured, getConfig, isTokenExpired } from '../utils/config';
import { logger } from '../utils/logger';

export async function updateCommand(): Promise<void> {
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
    logger.warn('Update cancelled.');
    return;
  }

  logger.blank();

  // Step 1: Build locally
  logger.step(1, 3, 'Building project...');

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
    });
  } catch (error) {
    logger.error(`Packaging failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return;
  }

  logger.blank();

  // Step 3: Upload as update
  logger.step(3, 3, 'Uploading update to server...');

  const uploadResult = await uploadService.upload({
    zipPath: packageResult.zipPath,
    projectName,
    projectType,
    buildMode: 'local',
    deploymentSource: 'cli',
    envInjected: false,
  });

  // Cleanup
  packageService.cleanup(packageResult.zipPath);

  if (!uploadResult.success) {
    logger.error(`Upload failed: ${uploadResult.error}`);
    return;
  }

  logger.success('Upload complete');
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
        logger.success(`✅ "${projectName}" updated successfully!`);

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
          logger.warn(`⚠  Health check: ${finalStatus.healthWarning}`);
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
    logger.success('Upload successful! Check web UI for deployment status.');
  }

  logger.blank();
}
