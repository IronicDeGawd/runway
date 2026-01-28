import { Router } from 'express';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import { requireAuth } from '../middleware/auth';

const execAsync = util.promisify(exec);
const router = Router();

// CPU usage calculation (average over 1 second)
function getCPUUsage(): Promise<number> {
  return new Promise((resolve) => {
    const startMeasure = os.cpus().map(cpu => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b);
      const idle = cpu.times.idle;
      return { total, idle };
    });

    setTimeout(() => {
      const endMeasure = os.cpus().map(cpu => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b);
        const idle = cpu.times.idle;
        return { total, idle };
      });

      const totalDelta = endMeasure.reduce((acc, end, i) => 
        acc + (end.total - startMeasure[i].total), 0);
      const idleDelta = endMeasure.reduce((acc, end, i) => 
        acc + (end.idle - startMeasure[i].idle), 0);

      const percentUsed = 100 - (100 * idleDelta / totalDelta);
      resolve(Math.round(percentUsed * 10) / 10);
    }, 1000);
  });
}

// Disk usage (requires df command - Linux/Mac)
async function getDiskUsage(): Promise<number> {
  try {
    const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}' | sed 's/%//'");
    return parseFloat(stdout.trim());
  } catch (error) {
    return 0;
  }
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const cpuUsage = await getCPUUsage();
    const diskUsage = await getDiskUsage();

    res.json({
      success: true,
      data: {
        cpu: cpuUsage,
        memory: Math.round((usedMem / totalMem) * 100 * 10) / 10,
        disk: diskUsage,
        uptime: Math.round(os.uptime()),
        totalMemory: totalMem, // Bytes
        usedMemory: usedMem, // Bytes
      }
    });
  } catch (error) {
    next(error);
  }
});

export const metricsRouter = router;
