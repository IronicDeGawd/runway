import inquirer from 'inquirer';
import axios from 'axios';
import ora from 'ora';
import { getConfig, isConfigured } from '../utils/config';
import { logger } from '../utils/logger';

interface DomainConfig {
  domain?: {
    domain: string;
    active: boolean;
    verificationStatus: 'pending' | 'verified' | 'failed';
    failureReason?: string;
  };
  securityMode: 'ip-http' | 'domain-https';
  serverIp?: string;
}

export async function domainCommand(): Promise<void> {
  logger.header('Runway Domain Configuration');

  if (!isConfigured()) {
    logger.error('CLI not configured. Run "runway init" first.');
    return;
  }

  const config = getConfig();
  const baseUrl = config.serverUrl;

  // Fetch current domain config
  const spinner = ora('Fetching domain configuration...').start();
  let domainConfig: DomainConfig;

  try {
    const response = await axios.get(`${baseUrl}/api/domain`, {
      headers: config.token ? { Authorization: `Bearer ${config.token}` } : {},
    });
    domainConfig = response.data;
    spinner.succeed('Configuration loaded');
  } catch (error: any) {
    spinner.fail('Failed to fetch configuration');
    if (error.response?.status === 401) {
      logger.error('Authentication failed. Run "runway init" to re-authenticate.');
    } else {
      logger.error(error.response?.data?.error || error.message);
    }
    return;
  }

  logger.blank();

  // Display current status
  logger.info(`Server IP: ${domainConfig.serverIp || 'Unknown'}`);
  logger.info(`Security Mode: ${domainConfig.securityMode}`);

  if (domainConfig.domain) {
    const d = domainConfig.domain;
    logger.info(`Domain: ${d.domain}`);
    logger.info(`Status: ${d.verificationStatus}${d.active ? ' (Active)' : ''}`);
    if (d.failureReason) {
      logger.warn(`Failure: ${d.failureReason}`);
    }
  } else {
    logger.dim('No domain configured');
  }

  logger.blank();

  // Show action menu
  const choices = domainConfig.domain
    ? [
        { name: 'Re-verify domain', value: 'verify' },
        { name: 'Change domain', value: 'change' },
        { name: 'Remove domain', value: 'remove' },
        { name: 'Exit', value: 'exit' },
      ]
    : [
        { name: 'Configure domain', value: 'add' },
        { name: 'Exit', value: 'exit' },
      ];

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices,
    },
  ]);

  if (action === 'exit') return;

  if (action === 'verify') {
    await verifyDomain(baseUrl!, config.token);
  } else if (action === 'add' || action === 'change') {
    await configureDomain(baseUrl!, config.token, domainConfig.serverIp);
  } else if (action === 'remove') {
    await removeDomain(baseUrl!, config.token);
  }
}

async function configureDomain(
  baseUrl: string,
  token: string | undefined,
  serverIp?: string
): Promise<void> {
  logger.blank();
  if (serverIp) {
    logger.info('Before configuring, ensure your domain has an A record pointing to:');
    logger.success(`  ${serverIp}`);
    logger.blank();
  }

  const { domain } = await inquirer.prompt([
    {
      type: 'input',
      name: 'domain',
      message: 'Enter domain (e.g., app.example.com):',
      validate: (input: string) => {
        if (!input.trim()) return 'Domain is required';
        if (!/^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(input)) {
          return 'Invalid domain format';
        }
        return true;
      },
    },
  ]);

  const spinner = ora('Verifying domain DNS...').start();

  try {
    const response = await axios.post(
      `${baseUrl}/api/domain`,
      { domain: domain.toLowerCase() },
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );

    if (response.data.success) {
      spinner.succeed('Domain configured successfully!');
      logger.success("HTTPS is now active via Let's Encrypt");
      logger.blank();
      logger.info(`Your server is now accessible at: https://${domain.toLowerCase()}`);
    } else {
      spinner.fail('Domain verification failed');
      if (response.data.verificationResult?.error) {
        logger.error(response.data.verificationResult.error);
      }
    }
  } catch (error: any) {
    spinner.fail('Failed to configure domain');
    logger.error(error.response?.data?.error || error.message);
  }
}

async function verifyDomain(baseUrl: string, token: string | undefined): Promise<void> {
  const spinner = ora('Re-verifying domain...').start();

  try {
    const response = await axios.post(
      `${baseUrl}/api/domain/verify`,
      {},
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );

    if (response.data.success) {
      spinner.succeed('Domain verified successfully!');
    } else {
      spinner.fail('Verification failed');
      if (response.data.verificationResult?.error) {
        logger.error(response.data.verificationResult.error);
      }
    }
  } catch (error: any) {
    spinner.fail('Verification failed');
    logger.error(error.response?.data?.error || error.message);
  }
}

async function removeDomain(baseUrl: string, token: string | undefined): Promise<void> {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'This will remove HTTPS and revert to IP-based access. Continue?',
      default: false,
    },
  ]);

  if (!confirm) {
    logger.warn('Cancelled.');
    return;
  }

  const spinner = ora('Removing domain...').start();

  try {
    await axios.delete(`${baseUrl}/api/domain`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    spinner.succeed('Domain removed');
    logger.dim('Server is now accessible via IP address only');
  } catch (error: any) {
    spinner.fail('Failed to remove domain');
    logger.error(error.response?.data?.error || error.message);
  }
}
