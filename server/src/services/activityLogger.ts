import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { eventBus } from '../events/eventBus';
import { activityRepository } from '../repositories';

export type ActivityType = 'deploy' | 'start' | 'stop' | 'error' | 'config' | 'delete';

export interface Activity {
  id: string;
  type: ActivityType;
  project: string;
  message: string;
  timestamp: string;
}

class ActivityLogger {
  async log(type: ActivityType, projectName: string, message: string, deploymentId?: string): Promise<void> {
    const activity: Activity = {
      id: uuidv4(),
      type,
      project: projectName,
      message,
      timestamp: new Date().toISOString()
    };

    try {
      activityRepository.log({
        type,
        projectName,
        message,
        deploymentId
      });
      logger.info(`Activity logged: ${type} - ${projectName}`);

      // Emit event for realtime updates
      eventBus.emitEvent('activity:new', activity);
    } catch (error) {
      logger.error('Failed to log activity', error);
    }
  }

  async getRecent(limit: number = 20): Promise<Activity[]> {
    try {
      const activities = activityRepository.getRecent(limit);
      // Convert to legacy format (projectName -> project)
      return activities.map(a => ({
        id: a.id,
        type: a.type,
        project: a.projectName,
        message: a.message,
        timestamp: a.timestamp
      }));
    } catch (error) {
      logger.error('Failed to read activities', error);
      return [];
    }
  }

  async getHourlyStats(hours: number = 12): Promise<number[]> {
    try {
      return activityRepository.getHourlyStats(hours);
    } catch (error) {
      logger.error('Failed to get hourly stats', error);
      return new Array(hours).fill(0);
    }
  }
}

export const activityLogger = new ActivityLogger();
