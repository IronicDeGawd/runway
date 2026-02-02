import { database } from '../services/database';
import { AuthConfig } from '../types/auth';

interface AuthRow {
  id: number;
  username: string;
  password_hash: string;
  jwt_secret: string;
  must_reset_password: number;
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
      mustResetPassword: row.must_reset_password === 1,
    };
  }

  set(config: AuthConfig): void {
    const now = new Date().toISOString();
    const mustResetPassword = config.mustResetPassword ? 1 : 0;

    // Use UPSERT to insert or update
    database.run(
      `INSERT INTO auth (id, username, password_hash, jwt_secret, must_reset_password, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         password_hash = excluded.password_hash,
         jwt_secret = excluded.jwt_secret,
         must_reset_password = excluded.must_reset_password,
         updated_at = excluded.updated_at`,
      [config.username, config.passwordHash, config.jwtSecret, mustResetPassword, now, now]
    );
  }

  updatePassword(passwordHash: string, clearResetFlag: boolean = false): void {
    const now = new Date().toISOString();
    if (clearResetFlag) {
      database.run(
        'UPDATE auth SET password_hash = ?, must_reset_password = 0, updated_at = ? WHERE id = 1',
        [passwordHash, now]
      );
    } else {
      database.run(
        'UPDATE auth SET password_hash = ?, updated_at = ? WHERE id = 1',
        [passwordHash, now]
      );
    }
  }

  setMustResetPassword(value: boolean): void {
    const now = new Date().toISOString();
    database.run(
      'UPDATE auth SET must_reset_password = ?, updated_at = ? WHERE id = 1',
      [value ? 1 : 0, now]
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
