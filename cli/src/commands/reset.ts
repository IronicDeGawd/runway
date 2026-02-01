import inquirer from 'inquirer';
import { clearConfig, isConfigured } from '../utils/config';
import { logger } from '../utils/logger';
import { initCommand } from './init';

export async function resetCommand(): Promise<void> {
  logger.header('Runway Reset');

  if (!isConfigured()) {
    logger.warn('CLI is not configured. Running init...');
    await initCommand({});
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'This will clear all CLI configuration. Continue?',
      default: false,
    },
  ]);

  if (!confirm) {
    logger.warn('Reset cancelled.');
    return;
  }

  clearConfig();
  logger.success('Configuration cleared.');
  logger.blank();

  // Re-run init
  await initCommand({});
}
