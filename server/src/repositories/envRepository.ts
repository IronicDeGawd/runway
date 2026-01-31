import { database } from '../services/database';

interface EnvVarRow {
  id: number;
  project_id: string;
  key: string;
  encrypted_value: string;
  iv: string;
  auth_tag: string;
  created_at: string;
  updated_at: string;
}

export interface EncryptedEnvVar {
  key: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export class EnvRepository {
  getByProject(projectId: string): EncryptedEnvVar[] {
    const rows = database.all<EnvVarRow>(
      'SELECT * FROM environment_variables WHERE project_id = ?',
      [projectId]
    );

    return rows.map(r => ({
      key: r.key,
      encryptedValue: r.encrypted_value,
      iv: r.iv,
      authTag: r.auth_tag,
    }));
  }

  set(projectId: string, key: string, encryptedValue: string, iv: string, authTag: string): void {
    const now = new Date().toISOString();

    // Use UPSERT to insert or update
    database.run(
      `INSERT INTO environment_variables (project_id, key, encrypted_value, iv, auth_tag, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, key) DO UPDATE SET
         encrypted_value = excluded.encrypted_value,
         iv = excluded.iv,
         auth_tag = excluded.auth_tag,
         updated_at = excluded.updated_at`,
      [projectId, key, encryptedValue, iv, authTag, now, now]
    );
  }

  setAll(projectId: string, vars: EncryptedEnvVar[]): void {
    const now = new Date().toISOString();

    database.transaction(() => {
      // Delete existing vars for this project
      database.run('DELETE FROM environment_variables WHERE project_id = ?', [projectId]);

      // Insert new vars
      for (const v of vars) {
        database.run(
          `INSERT INTO environment_variables (project_id, key, encrypted_value, iv, auth_tag, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [projectId, v.key, v.encryptedValue, v.iv, v.authTag, now, now]
        );
      }
    });
  }

  delete(projectId: string, key: string): void {
    database.run(
      'DELETE FROM environment_variables WHERE project_id = ? AND key = ?',
      [projectId, key]
    );
  }

  deleteByProject(projectId: string): void {
    database.run('DELETE FROM environment_variables WHERE project_id = ?', [projectId]);
  }
}

export const envRepository = new EnvRepository();
