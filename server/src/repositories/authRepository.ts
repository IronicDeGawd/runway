import { database } from '../services/database';
import { AuthConfig } from '../types/auth';

interface AuthRow {
  id: number;
  username: string;
  password_hash: string;
  jwt_secret: string;
  created_at: string;
  updated_at: string;
}

export class AuthRepository {
  get(): AuthConfig | null {
    const row = database.get<AuthRow>('SELECT * FROM auth WHERE id = 1');
    if (!row) return null;

    return {
      username: row.username,
      passwordHash: row.password_hash,
      jwtSecret: row.jwt_secret,
    };
  }

  set(config: AuthConfig): void {
    const now = new Date().toISOString();

    // Use UPSERT to insert or update
    database.run(
      `INSERT INTO auth (id, username, password_hash, jwt_secret, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         password_hash = excluded.password_hash,
         jwt_secret = excluded.jwt_secret,
         updated_at = excluded.updated_at`,
      [config.username, config.passwordHash, config.jwtSecret, now, now]
    );
  }

  updatePassword(passwordHash: string): void {
    const now = new Date().toISOString();
    database.run(
      'UPDATE auth SET password_hash = ?, updated_at = ? WHERE id = 1',
      [passwordHash, now]
    );
  }

  updateJwtSecret(jwtSecret: string): void {
    const now = new Date().toISOString();
    database.run(
      'UPDATE auth SET jwt_secret = ?, updated_at = ? WHERE id = 1',
      [jwtSecret, now]
    );
  }

  exists(): boolean {
    const row = database.get<{ count: number }>('SELECT COUNT(*) as count FROM auth WHERE id = 1');
    return (row?.count ?? 0) > 0;
  }
}

export const authRepository = new AuthRepository();
