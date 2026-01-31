import ora from 'ora';
import chalk from 'chalk';
import axios from 'axios';
import { isConfigured, getConfig } from '../utils/config';
import { logger } from '../utils/logger';

export async function statusCommand(projectName: string): Promise<void> {
  if (!projectName) {
    logger.error('Project name is required');
    logger.dim('Usage: runway status <project-name>');
    return;
  }

  // Check configuration
  if (!isConfigured()) {
    logger.error('CLI not configured. Run "runway init" first.');
    return;
  }

  const config = getConfig();
  const spinner = ora(`Fetching status for ${projectName}...`).start();

  try {
    // First, get the list of projects to find the one we want
    const response = await axios.get(
      `${config.serverUrl}/api/project`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
        },
      }
    );

    const projects = response.data.data || [];
    const project = projects.find(
      (p: { name: string }) => p.name.toLowerCase() === projectName.toLowerCase()
    );

    spinner.stop();

    if (!project) {
      logger.error(`Project "${projectName}" not found`);
      logger.blank();
      logger.dim('Available projects:');
      for (const p of projects) {
        logger.dim(`  - ${p.name}`);
      }
      return;
    }

    // Display project details
    logger.blank();
    console.log(chalk.bold(`  ${project.name}`));
    console.log('');
    console.log(`  ${chalk.dim('Type:')}     ${project.type}`);
    console.log(`  ${chalk.dim('Status:')}   ${getStatusBadge(project.status)}`);

    if (project.port) {
      console.log(`  ${chalk.dim('Port:')}     ${project.port}`);
    }

    if (project.uptime !== undefined) {
      console.log(`  ${chalk.dim('Uptime:')}   ${formatUptime(project.uptime)}`);
    }

    if (project.memory !== undefined) {
      console.log(`  ${chalk.dim('Memory:')}   ${formatBytes(project.memory)}`);
    }

    if (project.cpu !== undefined) {
      console.log(`  ${chalk.dim('CPU:')}      ${project.cpu.toFixed(1)}%`);
    }

    const safeName = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    console.log(`  ${chalk.dim('URL:')}      ${config.serverUrl}/app/${safeName}`);

    logger.blank();
  } catch (error) {
    spinner.fail('Failed to fetch status');
    if (axios.isAxiosError(error)) {
      logger.error(error.response?.data?.error || error.message);
    } else {
      logger.error(error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

function getStatusBadge(status: string): string {
  switch (status) {
    case 'running':
    case 'online':
      return chalk.black.bgGreen(` ${status.toUpperCase()} `);
    case 'stopped':
      return chalk.black.bgYellow(` ${status.toUpperCase()} `);
    case 'failed':
    case 'error':
      return chalk.white.bgRed(` ${status.toUpperCase()} `);
    case 'building':
    case 'deploying':
      return chalk.black.bgBlue(` ${status.toUpperCase()} `);
    default:
      return chalk.white.bgGray(` ${status.toUpperCase()} `);
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
