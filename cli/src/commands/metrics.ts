import axios from 'axios';
import ora from 'ora';
import { getConfig, isConfigured } from '../utils/config';
import { logger } from '../utils/logger';

interface Metrics {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
  totalMemory: number;
  usedMemory: number;
}

export async function metricsCommand(): Promise<void> {
  logger.header('Runway System Metrics');

  if (!isConfigured()) {
    logger.error('CLI not configured. Run "runway init" first.');
    return;
  }

  const config = getConfig();
  const spinner = ora('Fetching system metrics...').start();

  try {
    const response = await axios.get(`${config.serverUrl}/api/metrics`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });

    spinner.succeed('Metrics loaded');
    logger.blank();

    const m: Metrics = response.data.data;

    // Format uptime
    const days = Math.floor(m.uptime / 86400);
    const hours = Math.floor((m.uptime % 86400) / 3600);
    const minutes = Math.floor((m.uptime % 3600) / 60);
    const uptimeStr = `${days}d ${hours}h ${minutes}m`;

    // Format memory
    const totalGB = (m.totalMemory / 1024 / 1024 / 1024).toFixed(1);
    const usedGB = (m.usedMemory / 1024 / 1024 / 1024).toFixed(1);

    // Display metrics
    logger.info(`CPU Usage:    ${m.cpu.toFixed(1)}%`);
    logger.info(`Memory:       ${m.memory.toFixed(1)}% (${usedGB}GB / ${totalGB}GB)`);
    logger.info(`Disk:         ${m.disk.toFixed(1)}%`);
    logger.info(`Uptime:       ${uptimeStr}`);

    logger.blank();
  } catch (error: any) {
    spinner.fail('Failed to fetch metrics');
    if (error.response?.status === 401) {
      logger.error('Authentication failed. Run "runway init" to re-authenticate.');
    } else {
      logger.error(error.response?.data?.error || error.message);
    }
  }
}
