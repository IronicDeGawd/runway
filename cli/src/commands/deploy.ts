import inquirer from 'inquirer';
import ora from 'ora';
import { ProjectType, BuildMode } from '@runway/shared';
import { detectProject } from '../services/projectDetector';
import { buildService } from '../services/buildService';
import { packageService } from '../services/packageService';
import { createUploadService } from '../services/uploadService';
import { isConfigured, getConfig } from '../utils/config';
import { logger } from '../utils/logger';

interface DeployOptions {
  name?: string;
  type?: ProjectType;
  version?: string;
  buildLocal?: boolean;
  buildServer?: boolean;
  envFile?: string;
}

export async function deployCommand(options: DeployOptions): Promise<void> {
  logger.header('Runway Deploy');

  // Check configuration
  if (!isConfigured()) {
    logger.error('CLI not configured. Run "runway init" first.');
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

  // Determine project name
  let projectName = options.name || detectedProject.name;

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

    const buildResult = await buildService.build({
      projectPath: process.cwd(),
      projectType,
      projectName,
      packageManager: detectedProject.packageManager,
      envFile: options.envFile,
    });

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
        logger.blank();
        logger.info(`Your app is available at: ${config.serverUrl}/app/${safeName}`);
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
    logger.blank();
    logger.success('Upload successful!');
    logger.dim('Deployment is being processed. Check the web UI for status.');
  }

  logger.blank();
}
