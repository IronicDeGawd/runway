import { v4 as uuidv4 } from 'uuid';
import { ProjectConfig, ProjectType, PackageManager, DeploymentSource, UploadType } from '@runway/shared';
import { database } from '../services/database';
import { AppError } from '../middleware/errorHandler';

interface ProjectRow {
  id: string;
  name: string;
  type: ProjectType;
  port: number;
  pkg_manager: PackageManager;
  domains: string | null;
  created_at: string;
  updated_at: string;
  // ENV mutability tracking columns
  deployment_source: DeploymentSource | null;
  upload_type: UploadType | null;
  env_mutable: number;
  has_source: number;
}

function rowToProject(row: ProjectRow): ProjectConfig {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    port: row.port,
    pkgManager: row.pkg_manager,
    domains: row.domains ? JSON.parse(row.domains) : undefined,
    createdAt: row.created_at,
    // ENV mutability tracking (with defaults for backward compatibility)
    deploymentSource: row.deployment_source ?? 'ui',
    uploadType: row.upload_type ?? 'full',
    envMutable: row.env_mutable === 1,
    hasSource: row.has_source === 1,
  };
}

export class ProjectRepository {
  getAll(): ProjectConfig[] {
    const rows = database.all<ProjectRow>('SELECT * FROM projects ORDER BY created_at DESC');
    return rows.map(rowToProject);
  }

  getById(id: string): ProjectConfig | undefined {
    const row = database.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
    return row ? rowToProject(row) : undefined;
  }

  getByName(name: string): ProjectConfig | undefined {
    const row = database.get<ProjectRow>('SELECT * FROM projects WHERE name = ?', [name]);
    return row ? rowToProject(row) : undefined;
  }

  create(project: Omit<ProjectConfig, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): ProjectConfig {
    const id = project.id || uuidv4();
    const now = new Date().toISOString();
    const createdAt = project.createdAt || now;

    // Check for existing project with same name
    const existing = this.getByName(project.name);
    if (existing) {
      throw new AppError('Project with this name already exists', 409);
    }

    database.run(
      `INSERT INTO projects (id, name, type, port, pkg_manager, domains,
       deployment_source, upload_type, env_mutable, has_source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        project.name,
        project.type,
        project.port,
        project.pkgManager,
        project.domains ? JSON.stringify(project.domains) : null,
        project.deploymentSource ?? 'ui',
        project.uploadType ?? 'full',
        project.envMutable !== false ? 1 : 0,
        project.hasSource !== false ? 1 : 0,
        createdAt,
        now
      ]
    );

    return {
      id,
      name: project.name,
      type: project.type,
      port: project.port,
      pkgManager: project.pkgManager,
      domains: project.domains,
      deploymentSource: project.deploymentSource ?? 'ui',
      uploadType: project.uploadType ?? 'full',
      envMutable: project.envMutable !== false,
      hasSource: project.hasSource !== false,
      createdAt,
    };
  }

  update(id: string, updates: Partial<Omit<ProjectConfig, 'id' | 'createdAt'>>): ProjectConfig {
    const existing = this.getById(id);
    if (!existing) {
      throw new AppError('Project not found', 404);
    }

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      // Check if another project has this name
      const other = this.getByName(updates.name);
      if (other && other.id !== id) {
        throw new AppError('Another project with this name already exists', 409);
      }
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.port !== undefined) {
      fields.push('port = ?');
      values.push(updates.port);
    }
    if (updates.pkgManager !== undefined) {
      fields.push('pkg_manager = ?');
      values.push(updates.pkgManager);
    }
    if (updates.domains !== undefined) {
      fields.push('domains = ?');
      values.push(updates.domains ? JSON.stringify(updates.domains) : null);
    }
    // ENV mutability tracking fields
    if (updates.deploymentSource !== undefined) {
      fields.push('deployment_source = ?');
      values.push(updates.deploymentSource);
    }
    if (updates.uploadType !== undefined) {
      fields.push('upload_type = ?');
      values.push(updates.uploadType);
    }
    if (updates.envMutable !== undefined) {
      fields.push('env_mutable = ?');
      values.push(updates.envMutable ? 1 : 0);
    }
    if (updates.hasSource !== undefined) {
      fields.push('has_source = ?');
      values.push(updates.hasSource ? 1 : 0);
    }

    values.push(id);
    database.run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getById(id)!;
  }

  delete(id: string): void {
    const existing = this.getById(id);
    if (!existing) {
      throw new AppError('Project not found', 404);
    }

    database.run('DELETE FROM projects WHERE id = ?', [id]);
  }

  existsByName(name: string): boolean {
    const row = database.get<{ count: number }>('SELECT COUNT(*) as count FROM projects WHERE name = ?', [name]);
    return (row?.count ?? 0) > 0;
  }
}

export const projectRepository = new ProjectRepository();
