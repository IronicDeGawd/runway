import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { statfs } from 'node:fs/promises';
import { logger } from '../utils/logger';

const LOGS_DIR = path.resolve(process.cwd(), '../logs');
const RESOURCE_LOG_FILE = path.join(LOGS_DIR, 'resource-monitor.log');
const MONITOR_INTERVAL = 15 * 60 * 1000; // 15 minutes

let monitorInterval: NodeJS.Timeout | null = null;

export async function startResourceMonitor(): Promise<void> {
  // Ensure logs directory exists
  await fs.ensureDir(LOGS_DIR);

  logger.info('Starting resource monitor (logs every 15 minutes)');

  // Log immediately on startup
  await logResourceUsage();

  // Then log every 15 minutes
  monitorInterval = setInterval(async () => {
    await logResourceUsage();
  }, MONITOR_INTERVAL);
}

export function stopResourceMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

async function logResourceUsage(): Promise<void> {
  try {
    const timestamp = new Date().toISOString();

    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = ((usedMem / totalMem) * 100).toFixed(1);

    // CPU load
    const [load1, load5, load15] = os.loadavg();
    const cpuCount = os.cpus().length;

    // Disk usage
    let diskPercent = 'N/A';
    try {
      const stats = await statfs('/');
      const usedBlocks = stats.blocks - stats.bfree;
      diskPercent = ((usedBlocks / stats.blocks) * 100).toFixed(1);
    } catch (e) {
      // Ignore disk errors
    }

    // File descriptor count (Linux only)
    let fdCount = 'N/A';
    try {
      const pid = process.pid;
      const fdDir = `/proc/${pid}/fd`;
      if (await fs.pathExists(fdDir)) {
        const fds = await fs.readdir(fdDir);
        fdCount = fds.length.toString();
      }
    } catch (e) {
      // Ignore FD errors (not on Linux)
    }

    // System uptime
    const uptime = Math.floor(os.uptime() / 60); // minutes

    const logLine = `[${timestamp}] MEM: ${memPercent}% (${(usedMem / 1024 / 1024 / 1024).toFixed(2)}GB/${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB) | DISK: ${diskPercent}% | FDs: ${fdCount} | LOAD: ${load1.toFixed(2)}/${load5.toFixed(2)}/${load15.toFixed(2)} (${cpuCount} cores) | UPTIME: ${uptime}min\n`;

    // Append to log file
    await fs.appendFile(RESOURCE_LOG_FILE, logLine);

    logger.debug('Resource usage logged');
  } catch (error) {
    logger.error('Failed to log resource usage', error);
  }
}