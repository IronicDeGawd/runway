import { v4 as uuidv4 } from 'uuid';
import { database } from '../services/database';

export type ActivityType = 'deploy' | 'start' | 'stop' | 'error' | 'config' | 'delete';

export interface Activity {
  id: string;
  type: ActivityType;
  projectName: string;
  message: string;
  timestamp: string;
  deploymentId?: string;
}

interface ActivityRow {
  id: string;
  type: ActivityType;
  project_name: string;
  message: string;
  timestamp: string;
  deployment_id: string | null;
}

function rowToActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    type: row.type,
    projectName: row.project_name,
    message: row.message,
    timestamp: row.timestamp,
    deploymentId: row.deployment_id ?? undefined,
  };
}

export interface CreateActivityInput {
  type: ActivityType;
  projectName: string;
  message: string;
  deploymentId?: string;
}

const MAX_ACTIVITIES = 500; // Keep more in SQLite since storage is efficient

export class ActivityRepository {
  log(input: CreateActivityInput): Activity {
    const id = uuidv4();
    const now = new Date().toISOString();

    database.run(
      `INSERT INTO activities (id, type, project_name, message, timestamp, deployment_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.type, input.projectName, input.message, now, input.deploymentId ?? null]
    );

    // Clean up old activities to prevent unbounded growth
    this.cleanup();

    return {
      id,
      type: input.type,
      projectName: input.projectName,
      message: input.message,
      timestamp: now,
      deploymentId: input.deploymentId,
    };
  }

  getRecent(limit: number = 20): Activity[] {
    const rows = database.all<ActivityRow>(
      'SELECT * FROM activities ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );
    return rows.map(rowToActivity);
  }

  getByProject(projectName: string, limit: number = 20): Activity[] {
    const rows = database.all<ActivityRow>(
      'SELECT * FROM activities WHERE project_name = ? ORDER BY timestamp DESC LIMIT ?',
      [projectName, limit]
    );
    return rows.map(rowToActivity);
  }

  getByDeployment(deploymentId: string): Activity[] {
    const rows = database.all<ActivityRow>(
      'SELECT * FROM activities WHERE deployment_id = ? ORDER BY timestamp ASC',
      [deploymentId]
    );
    return rows.map(rowToActivity);
  }

  getHourlyStats(hours: number = 12): number[] {
    const stats: number[] = new Array(hours).fill(0);
    const now = new Date();

    // Get activities from the past N hours
    const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

    const rows = database.all<{ timestamp: string }>(
      'SELECT timestamp FROM activities WHERE timestamp >= ? ORDER BY timestamp DESC',
      [cutoff]
    );

    rows.forEach(row => {
      const activityTime = new Date(row.timestamp);
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
  }

  private cleanup(): void {
    // Delete activities beyond MAX_ACTIVITIES
    database.run(
      `DELETE FROM activities WHERE id NOT IN (
        SELECT id FROM activities ORDER BY timestamp DESC LIMIT ?
      )`,
      [MAX_ACTIVITIES]
    );
  }

  deleteByProject(projectName: string): void {
    database.run('DELETE FROM activities WHERE project_name = ?', [projectName]);
  }
}

export const activityRepository = new ActivityRepository();
