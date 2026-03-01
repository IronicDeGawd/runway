#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { deployCommand } from './commands/deploy';
import { listCommand } from './commands/list';
import { statusCommand } from './commands/status';
import { resetCommand } from './commands/reset';
import { domainCommand } from './commands/domain';
import { metricsCommand } from './commands/metrics';
import { loginCommand } from './commands/login';
import { updateCommand } from './commands/update';
import { logsCommand } from './commands/logs';
import { buildEnvCommand } from './commands/env';

const program = new Command();

program
  .name('runway')
  .description('CLI tool for deploying projects to Runway')
  .version('0.0.1');

// Init command
program
  .command('init')
  .description('Configure the Runway CLI')
  .option('-s, --server <url>', 'Server URL')
  .action(initCommand);

// Login command (re-authenticate without full init)
program
  .command('login')
  .description('Re-authenticate with the Runway server')
  .action(loginCommand);

// Deploy command
program
  .command('deploy')
  .description('Deploy the current project')
  .option('-n, --name <name>', 'Project name')
  .option('-t, --type <type>', 'Project type (react, next, node)')
  .option('-v, --version <version>', 'Version string')
  .option('--build-local', 'Build locally before uploading (default)')
  .option('--build-server', 'Upload source and build on server')
  .option('-e, --env-file <path>', 'Path to environment file')
  .action(deployCommand);

// Update command (update existing deployed project)
program
  .command('update')
  .description('Update an existing deployed project')
  .option('-e, --env-file <path>', 'Path to environment file')
  .action(updateCommand);

// Env command (manage environment variables)
program.addCommand(buildEnvCommand());

// List command
program
  .command('list')
  .alias('ls')
  .description('List deployed projects')
  .action(listCommand);

// Status command
program
  .command('status <project>')
  .description('Get status of a deployed project')
  .action(statusCommand);

// Logs command
program
  .command('logs [project]')
  .description('View logs for a deployed project')
  .option('-n, --lines <count>', 'Number of lines to show', '100')
  .option('--type <type>', 'Log type: out, error, or all', 'all')
  .action(logsCommand);

// Reset command
program
  .command('reset')
  .description('Reset CLI configuration and re-run init')
  .action(resetCommand);

// Domain command
program
  .command('domain')
  .description('Configure server domain (same as UI)')
  .action(domainCommand);

// Metrics command
program
  .command('metrics')
  .description('Display server system metrics')
  .action(metricsCommand);

// Parse command line arguments
program.parse();

