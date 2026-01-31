import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

const DATA_DIR = path.resolve(process.cwd(), '../data');
const DB_PATH = path.join(DATA_DIR, 'runway.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class DatabaseService {
  private db: Database.Database | null = null;

  initialize(): Database.Database {
    if (this.db) {
      return this.db;
    }

    logger.info(`Initializing SQLite database at ${DB_PATH}`);

    this.db = new Database(DB_PATH);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Run migrations
    this.migrate();

    logger.info('Database initialized successfully');
    return this.db;
  }

  getDb(): Database.Database {
    if (!this.db) {
      return this.initialize();
    }
    return this.db;
  }

  private migrate(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Create migrations table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const migrations = this.getMigrations();
    const appliedMigrations = this.getAppliedMigrations();

    for (const migration of migrations) {
      if (!appliedMigrations.includes(migration.name)) {
        logger.info(`Running migration: ${migration.name}`);
        this.db.transaction(() => {
          this.db!.exec(migration.sql);
          this.db!.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
        })();
        logger.info(`Migration ${migration.name} applied successfully`);
      }
    }
  }

  private getAppliedMigrations(): string[] {
    if (!this.db) return [];

    try {
      const rows = this.db.prepare('SELECT name FROM migrations ORDER BY id').all() as { name: string }[];
      return rows.map(r => r.name);
    } catch {
      // Table doesn't exist yet
      return [];
    }
  }

  private getMigrations(): { name: string; sql: string }[] {
    return [
      {
        name: '001_initial_schema',
        sql: `
          -- projects table (replaces projects.json)
          CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('react', 'next', 'node')),
            port INTEGER NOT NULL,
            pkg_manager TEXT NOT NULL CHECK(pkg_manager IN ('npm', 'yarn', 'pnpm')),
            domains TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
          CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);

          -- deployments table (NEW - deployment history)
          CREATE TABLE IF NOT EXISTS deployments (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            version TEXT,
            status TEXT NOT NULL CHECK(status IN ('queued', 'building', 'deploying', 'success', 'failed')),
            build_mode TEXT CHECK(build_mode IN ('local', 'server')),
            logs TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            error_message TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
          CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
          CREATE INDEX IF NOT EXISTS idx_deployments_started ON deployments(started_at);

          -- activities table (replaces activity.json)
          CREATE TABLE IF NOT EXISTS activities (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('deploy', 'start', 'stop', 'error', 'config', 'delete')),
            project_name TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            deployment_id TEXT,
            FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE SET NULL
          );

          CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);
          CREATE INDEX IF NOT EXISTS idx_activities_project ON activities(project_name);
          CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);

          -- ports table (replaces ports.json)
          CREATE TABLE IF NOT EXISTS ports (
            port INTEGER PRIMARY KEY,
            service_id TEXT NOT NULL,
            allocated_at TEXT NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_ports_service ON ports(service_id);

          -- auth table (replaces auth.json)
          CREATE TABLE IF NOT EXISTS auth (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            jwt_secret TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          -- environment_variables table (replaces .env.enc files)
          CREATE TABLE IF NOT EXISTS environment_variables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            key TEXT NOT NULL,
            encrypted_value TEXT NOT NULL,
            iv TEXT NOT NULL,
            auth_tag TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            UNIQUE(project_id, key)
          );

          CREATE INDEX IF NOT EXISTS idx_env_project ON environment_variables(project_id);
        `
      },
      {
        name: '002_add_static_project_type',
        sql: `
          -- SQLite doesn't support ALTER CHECK constraint, so we need to:
          -- 1. Create new table with updated constraint
          -- 2. Copy data
          -- 3. Drop old table
          -- 4. Rename new table

          CREATE TABLE projects_new (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('react', 'next', 'node', 'static')),
            port INTEGER NOT NULL,
            pkg_manager TEXT NOT NULL CHECK(pkg_manager IN ('npm', 'yarn', 'pnpm', 'none')),
            domains TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          INSERT INTO projects_new SELECT * FROM projects;

          DROP TABLE projects;

          ALTER TABLE projects_new RENAME TO projects;

          CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
          CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
        `
      }
    ];
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('Database connection closed');
    }
  }

  // Helper methods for common operations
  run(sql: string, params: unknown[] = []): Database.RunResult {
    return this.getDb().prepare(sql).run(...params);
  }

  get<T>(sql: string, params: unknown[] = []): T | undefined {
    return this.getDb().prepare(sql).get(...params) as T | undefined;
  }

  all<T>(sql: string, params: unknown[] = []): T[] {
    return this.getDb().prepare(sql).all(...params) as T[];
  }

  transaction<T>(fn: () => T): T {
    return this.getDb().transaction(fn)();
  }
}

export const database = new DatabaseService();
