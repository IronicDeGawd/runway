import inquirer from 'inquirer';
import axios from 'axios';
import chalk from 'chalk';
import { isConfigured, getConfig, isTokenExpired } from '../utils/config';
import { createUploadService } from '../services/uploadService';
import { logger } from '../utils/logger';

interface LogsOptions {
  lines?: string;
  type?: string;
}

export async function logsCommand(project?: string, options: LogsOptions = {}): Promise<void> {
  logger.header('Runway Logs');

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

  let uploadService;
  try {
    uploadService = createUploadService();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    return;
  }

  let projects;
  try {
    projects = await uploadService.listProjects();
  } catch (error) {
    logger.error('Failed to fetch projects');
    return;
  }

  if (projects.length === 0) {
    logger.warn('No projects deployed.');
    return;
  }

  // Filter to only PM2-managed projects (node, next)
  const pm2Projects = projects.filter(p => p.type === 'node' || p.type === 'next');

  if (pm2Projects.length === 0) {
    logger.warn('No Node.js or Next.js projects found. Logs are only available for PM2-managed projects.');
    return;
  }

  let projectId: string;
  let projectName: string;

  if (project) {
    // Resolve name to ID
    const match = pm2Projects.find(p => p.name.toLowerCase() === project.toLowerCase());
    if (!match) {
      logger.error(`Project "${project}" not found or is not a PM2-managed project.`);
      logger.dim('Available projects:');
      for (const p of pm2Projects) {
        logger.dim(`  - ${p.name}`);
      }
      return;
    }
    projectId = match.id;
    projectName = match.name;
  } else {
    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: 'Select project to view logs:',
        choices: pm2Projects.map(p => ({
          name: `${p.name} (${p.type}) — ${p.status}`,
          value: p,
        })),
      },
    ]);

    projectId = selected.id;
    projectName = selected.name;
  }

  // Fetch logs
  const lines = parseInt(options.lines || '100');
  const logType = options.type || 'all';

  logger.dim(`Fetching last ${lines} lines for ${projectName}...`);
  logger.blank();

  try {
    const response = await axios.get(
      `${config.serverUrl}/api/process/${projectId}/logs`,
      {
        params: { lines, type: logType },
        headers: config.token ? { Authorization: `Bearer ${config.token}` } : {},
        timeout: 15000,
      }
    );

    const data = response.data.data;

    if (data.stdout) {
      console.log(chalk.bold.green('━━━ stdout ━━━'));
      console.log(data.stdout);
    }

    if (data.stderr) {
      if (data.stdout) console.log(); // spacer
      console.log(chalk.bold.red('━━━ stderr ━━━'));
      console.log(data.stderr);
    }

    if (!data.stdout && !data.stderr) {
      logger.dim('No logs found for this project.');
    }
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        logger.error('Project not found. Use "runway list" to see deployed projects.');
      } else {
        logger.error(`Failed to fetch logs: ${error.response?.data?.error || error.message}`);
      }
    } else {
      logger.error(`Failed to fetch logs: ${error.message}`);
    }
  }

  logger.blank();
}
