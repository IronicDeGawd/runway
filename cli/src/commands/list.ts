import ora from 'ora';
import chalk from 'chalk';
import { createUploadService } from '../services/uploadService';
import { isConfigured, getConfig } from '../utils/config';
import { logger } from '../utils/logger';

export async function listCommand(): Promise<void> {
  // Check configuration
  if (!isConfigured()) {
    logger.error('CLI not configured. Run "runway init" first.');
    return;
  }

  const config = getConfig();
  logger.dim(`Server: ${config.serverUrl}`);
  logger.blank();

  const spinner = ora('Fetching projects...').start();

  try {
    const uploadService = createUploadService();
    const projects = await uploadService.listProjects();

    spinner.stop();

    if (projects.length === 0) {
      logger.info('No projects deployed yet.');
      logger.blank();
      logger.dim('Deploy your first project with: runway deploy');
      return;
    }

    console.log('');
    console.log(chalk.bold('  Deployed Projects:'));
    console.log('');

    for (const project of projects) {
      const statusColor = getStatusColor(project.status);
      const statusIcon = getStatusIcon(project.status);

      console.log(
        `  ${statusIcon} ${chalk.bold(project.name)} ` +
        chalk.dim(`(${project.type})`) +
        ` - ${statusColor(project.status)}`
      );
    }

    console.log('');
    logger.dim(`Total: ${projects.length} project(s)`);
  } catch (error) {
    spinner.fail('Failed to fetch projects');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
  }
}

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'running':
    case 'online':
      return chalk.green;
    case 'stopped':
      return chalk.yellow;
    case 'failed':
    case 'error':
      return chalk.red;
    case 'building':
    case 'deploying':
      return chalk.blue;
    default:
      return chalk.gray;
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'running':
    case 'online':
      return chalk.green('●');
    case 'stopped':
      return chalk.yellow('○');
    case 'failed':
    case 'error':
      return chalk.red('●');
    case 'building':
    case 'deploying':
      return chalk.blue('◐');
    default:
      return chalk.gray('○');
  }
}
