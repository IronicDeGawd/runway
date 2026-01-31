import { v4 as uuidv4 } from 'uuid';
import { DeploymentSource, UploadType } from '@runway/shared';
import { database } from '../services/database';
import { AppError } from '../middleware/errorHandler';

export type DeploymentStatus = 'queued' | 'building' | 'deploying' | 'success' | 'failed';
export type BuildMode = 'local' | 'server';

export interface Deployment {
  id: string;
  projectId: string;
  version?: string;
  status: DeploymentStatus;
  buildMode?: BuildMode;
  logs?: string;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  // ENV mutability tracking
  deploymentSource?: DeploymentSource;
  uploadType?: UploadType;
  envInjected?: boolean;
}

interface DeploymentRow {
  id: string;
  project_id: string;
  version: string | null;
  status: DeploymentStatus;
  build_mode: BuildMode | null;
  logs: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  // ENV mutability tracking columns
  deployment_source: DeploymentSource | null;
  upload_type: UploadType | null;
  env_injected: number;
}

function rowToDeployment(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version ?? undefined,
    status: row.status,
    buildMode: row.build_mode ?? undefined,
    logs: row.logs ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    // ENV mutability tracking (with defaults for backward compatibility)
    deploymentSource: row.deployment_source ?? 'ui',
    uploadType: row.upload_type ?? 'full',
    envInjected: row.env_injected === 1,
  };
}

export interface CreateDeploymentInput {
  projectId: string;
  version?: string;
  buildMode?: BuildMode;
  // ENV mutability tracking
  deploymentSource?: DeploymentSource;
  uploadType?: UploadType;
  envInjected?: boolean;
}

export class DeploymentRepository {
  create(input: CreateDeploymentInput): Deployment {
    const id = uuidv4();
    const now = new Date().toISOString();

    database.run(
      `INSERT INTO deployments (id, project_id, version, status, build_mode,
       deployment_source, upload_type, env_injected, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.projectId,
        input.version ?? null,
        'queued',
        input.buildMode ?? null,
        input.deploymentSource ?? 'ui',
        input.uploadType ?? 'full',
        input.envInjected ? 1 : 0,
        now
      ]
    );

    return {
      id,
      projectId: input.projectId,
      version: input.version,
      status: 'queued',
      buildMode: input.buildMode,
      deploymentSource: input.deploymentSource ?? 'ui',
      uploadType: input.uploadType ?? 'full',
      envInjected: input.envInjected ?? false,
      startedAt: now,
    };
  }

  getById(id: string): Deployment | undefined {
    const row = database.get<DeploymentRow>('SELECT * FROM deployments WHERE id = ?', [id]);
    return row ? rowToDeployment(row) : undefined;
  }

  getByProject(projectId: string, limit: number = 10): Deployment[] {
    const rows = database.all<DeploymentRow>(
      'SELECT * FROM deployments WHERE project_id = ? ORDER BY started_at DESC LIMIT ?',
      [projectId, limit]
    );
    return rows.map(rowToDeployment);
  }

  getLatestByProject(projectId: string): Deployment | undefined {
    const row = database.get<DeploymentRow>(
      'SELECT * FROM deployments WHERE project_id = ? ORDER BY started_at DESC LIMIT 1',
      [projectId]
    );
    return row ? rowToDeployment(row) : undefined;
  }

  getRecent(limit: number = 20): Deployment[] {
    const rows = database.all<DeploymentRow>(
      'SELECT * FROM deployments ORDER BY started_at DESC LIMIT ?',
      [limit]
    );
    return rows.map(rowToDeployment);
  }

  updateStatus(id: string, status: DeploymentStatus, errorMessage?: string): Deployment {
    const existing = this.getById(id);
    if (!existing) {
      throw new AppError('Deployment not found', 404);
    }

    const completedAt = ['success', 'failed'].includes(status) ? new Date().toISOString() : null;

    database.run(
      `UPDATE deployments SET status = ?, error_message = ?, completed_at = ? WHERE id = ?`,
      [status, errorMessage ?? null, completedAt, id]
    );

    return this.getById(id)!;
  }

  appendLogs(id: string, logLine: string): void {
    const existing = this.getById(id);
    if (!existing) {
      throw new AppError('Deployment not found', 404);
    }

    const currentLogs = existing.logs ?? '';
    const newLogs = currentLogs + logLine + '\n';

    database.run('UPDATE deployments SET logs = ? WHERE id = ?', [newLogs, id]);
  }

  delete(id: string): void {
    database.run('DELETE FROM deployments WHERE id = ?', [id]);
  }

  deleteByProject(projectId: string): void {
    database.run('DELETE FROM deployments WHERE project_id = ?', [projectId]);
  }
}

export const deploymentRepository = new DeploymentRepository();
