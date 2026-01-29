import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import lockfile from 'proper-lockfile';
import { logger } from '../utils/logger';
import { eventBus } from '../events/eventBus';

const DATA_DIR = path.resolve(process.cwd(), '../data');
const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');
const MAX_ACTIVITIES = 100; // Keep last 100 events

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export type ActivityType = 'deploy' | 'start' | 'stop' | 'error' | 'config' | 'delete';

export interface Activity {
  id: string;
  type: ActivityType;
  project: string;
  message: string;
  timestamp: string;
}

class ActivityLogger {
  constructor() {
    if (!fs.existsSync(ACTIVITY_FILE)) {
      fs.writeFileSync(ACTIVITY_FILE, JSON.stringify([]));
    }
  }

  async log(type: ActivityType, projectName: string, message: string): Promise<void> {
    const activity: Activity = {
      id: uuidv4(),
      type,
      project: projectName,
      message,
      timestamp: new Date().toISOString()
    };

    try {
      const release = await lockfile.lock(ACTIVITY_FILE);
      try {
        const raw = await fs.readFile(ACTIVITY_FILE, 'utf-8');
        const activities: Activity[] = JSON.parse(raw);
        
        activities.unshift(activity); // Add to beginning
        
        // Keep only last MAX_ACTIVITIES
        if (activities.length > MAX_ACTIVITIES) {
          activities.splice(MAX_ACTIVITIES);
        }

        await fs.writeFile(ACTIVITY_FILE, JSON.stringify(activities, null, 2));
        logger.info(`Activity logged: ${type} - ${projectName}`);
        
        // Emit event for realtime updates
        eventBus.emitEvent('activity:new', activity);
      } finally {
        await release();
      }
    } catch (error) {
      logger.error('Failed to log activity', error);
    }
  }

  async getRecent(limit: number = 20): Promise<Activity[]> {
    try {
      const raw = await fs.readFile(ACTIVITY_FILE, 'utf-8');
      const activities: Activity[] = JSON.parse(raw);
      return activities.slice(0, limit);
    } catch (error) {
      logger.error('Failed to read activities', error);
      return [];
    }
  }

  async getHourlyStats(hours: number = 12): Promise<number[]> {
    try {
      const raw = await fs.readFile(ACTIVITY_FILE, 'utf-8');
      const activities: Activity[] = JSON.parse(raw);

      const now = new Date();
      const stats: number[] = new Array(hours).fill(0);

      activities.forEach((activity) => {
        const activityTime = new Date(activity.timestamp);
        const hoursAgo = Math.floor((now.getTime() - activityTime.getTime()) / (1000 * 60 * 60));

        if (hoursAgo >= 0 && hoursAgo < hours) {
          // Index 0 = oldest (hours-1 ago), Index hours-1 = newest (now)
          const index = hours - 1 - hoursAgo;
          stats[index]++;
        }
      });

      // Normalize to percentages (0-100) based on max value
      const maxCount = Math.max(...stats, 1);
      return stats.map(count => Math.round((count / maxCount) * 100));
    } catch (error) {
      logger.error('Failed to get hourly stats', error);
      return new Array(hours).fill(0);
    }
  }
}

export const activityLogger = new ActivityLogger();
