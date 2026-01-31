/**
 * Migration script to import existing JSON data into SQLite database
 *
 * Run with: npx ts-node src/scripts/migrate-json-to-sqlite.ts
 */

import fs from 'fs';
import path from 'path';
import { database } from '../services/database';
import { projectRepository, activityRepository, portRepository, authRepository } from '../repositories';
import { ProjectConfig } from '@runway/shared';

const DATA_DIR = path.resolve(process.cwd(), '../data');

interface LegacyActivity {
  id: string;
  type: 'deploy' | 'start' | 'stop' | 'error' | 'config' | 'delete';
  project: string;
  message: string;
  timestamp: string;
}

async function migrateProjects(): Promise<number> {
  const projectsFile = path.join(DATA_DIR, 'projects.json');
  if (!fs.existsSync(projectsFile)) {
    console.log('No projects.json found, skipping project migration');
    return 0;
  }

  const raw = fs.readFileSync(projectsFile, 'utf-8');
  const projects: ProjectConfig[] = JSON.parse(raw);

  let migrated = 0;
  for (const project of projects) {
    try {
      // Check if project already exists in SQLite
      const existing = projectRepository.getById(project.id);
      if (existing) {
        console.log(`  Project ${project.name} already exists, skipping`);
        continue;
      }

      projectRepository.create(project);
      migrated++;
      console.log(`  Migrated project: ${project.name}`);
    } catch (error) {
      console.error(`  Failed to migrate project ${project.name}:`, error);
    }
  }

  return migrated;
}

async function migrateActivities(): Promise<number> {
  const activityFile = path.join(DATA_DIR, 'activity.json');
  if (!fs.existsSync(activityFile)) {
    console.log('No activity.json found, skipping activity migration');
    return 0;
  }

  const raw = fs.readFileSync(activityFile, 'utf-8');
  const activities: LegacyActivity[] = JSON.parse(raw);

  let migrated = 0;
  // Process in reverse order to maintain chronological order (oldest first)
  for (const activity of activities.reverse()) {
    try {
      activityRepository.log({
        type: activity.type,
        projectName: activity.project,
        message: activity.message,
      });
      migrated++;
    } catch (error) {
      console.error(`  Failed to migrate activity:`, error);
    }
  }

  console.log(`  Migrated ${migrated} activities`);
  return migrated;
}

async function migratePorts(): Promise<number> {
  const portsFile = path.join(DATA_DIR, 'ports.json');
  if (!fs.existsSync(portsFile)) {
    console.log('No ports.json found, skipping port migration');
    return 0;
  }

  const raw = fs.readFileSync(portsFile, 'utf-8');
  const ports: Record<string, string> = JSON.parse(raw);

  let migrated = 0;
  for (const [portStr, serviceId] of Object.entries(ports)) {
    const port = parseInt(portStr, 10);
    try {
      // Check if port already allocated
      if (portRepository.isAllocated(port)) {
        console.log(`  Port ${port} already allocated, skipping`);
        continue;
      }

      // Directly insert into database since we're importing existing allocation
      database.run(
        'INSERT INTO ports (port, service_id, allocated_at) VALUES (?, ?, ?)',
        [port, serviceId, new Date().toISOString()]
      );
      migrated++;
      console.log(`  Migrated port: ${port} -> ${serviceId}`);
    } catch (error) {
      console.error(`  Failed to migrate port ${port}:`, error);
    }
  }

  return migrated;
}

async function migrateAuth(): Promise<boolean> {
  const authFile = path.join(DATA_DIR, 'auth.json');
  if (!fs.existsSync(authFile)) {
    console.log('No auth.json found, skipping auth migration');
    return false;
  }

  // Check if auth already exists in SQLite
  if (authRepository.exists()) {
    console.log('  Auth config already exists in SQLite, skipping');
    return false;
  }

  const raw = fs.readFileSync(authFile, 'utf-8');
  const auth = JSON.parse(raw);

  try {
    authRepository.set({
      username: auth.username,
      passwordHash: auth.passwordHash,
      jwtSecret: auth.jwtSecret,
    });
    console.log('  Migrated auth config');
    return true;
  } catch (error) {
    console.error('  Failed to migrate auth config:', error);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('=== JSON to SQLite Migration ===\n');

  // Initialize database
  console.log('Initializing SQLite database...');
  database.initialize();
  console.log('Database initialized\n');

  // Migrate auth first (needed for encryption key in env migration)
  console.log('Migrating auth config...');
  await migrateAuth();
  console.log('');

  // Migrate projects
  console.log('Migrating projects...');
  const projectCount = await migrateProjects();
  console.log(`Migrated ${projectCount} projects\n`);

  // Migrate activities
  console.log('Migrating activities...');
  const activityCount = await migrateActivities();
  console.log(`Migrated ${activityCount} activities\n`);

  // Migrate ports
  console.log('Migrating ports...');
  const portCount = await migratePorts();
  console.log(`Migrated ${portCount} ports\n`);

  console.log('=== Migration Complete ===');
  console.log(`
Summary:
- Projects: ${projectCount}
- Activities: ${activityCount}
- Ports: ${portCount}

The SQLite database is now populated with data from the JSON files.
Both JSON and SQLite will be kept in sync during the dual-write phase.
`);

  // Backup JSON files
  console.log('Creating backups of JSON files...');
  const backupDir = path.join(DATA_DIR, 'backup_json');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filesToBackup = ['projects.json', 'activity.json', 'ports.json', 'auth.json'];
  for (const file of filesToBackup) {
    const srcPath = path.join(DATA_DIR, file);
    const destPath = path.join(backupDir, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  Backed up ${file}`);
    }
  }

  console.log('\nBackup complete. Original JSON files preserved in data/backup_json/');
}

main().catch(console.error);
