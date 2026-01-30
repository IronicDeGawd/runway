import inquirer from 'inquirer';
import axios from 'axios';
import { setServerUrl, setToken, getConfig, isConfigured } from '../utils/config';
import { logger } from '../utils/logger';

interface InitOptions {
  server?: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  logger.header('Runway CLI Setup');

  // Check if already configured
  if (isConfigured()) {
    const config = getConfig();
    logger.info(`Currently configured to: ${config.serverUrl}`);

    const { reconfigure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reconfigure',
        message: 'Do you want to reconfigure?',
        default: false,
      },
    ]);

    if (!reconfigure) {
      logger.info('Configuration unchanged.');
      return;
    }
  }

  // Get server URL
  let serverUrl = options.server;

  if (!serverUrl) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'serverUrl',
        message: 'Enter your Runway server URL:',
        default: 'https://deploy.example.com',
        validate: (input: string) => {
          try {
            new URL(input);
            return true;
          } catch {
            return 'Please enter a valid URL';
          }
        },
      },
    ]);
    serverUrl = answers.serverUrl as string;
  }

  // Normalize URL
  serverUrl = serverUrl!.replace(/\/+$/, '');

  // Test connection
  logger.info('Testing connection...');
  try {
    await axios.get(`${serverUrl}/health`, { timeout: 10000 });
    logger.success('Server is reachable');
  } catch (error) {
    logger.error(`Cannot reach server at ${serverUrl}`);
    logger.dim('Make sure the server is running and the URL is correct.');
    return;
  }

  // Get credentials
  const credentials = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: 'Username:',
      validate: (input: string) => input.length > 0 || 'Username is required',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      validate: (input: string) => input.length > 0 || 'Password is required',
    },
  ]);

  // Attempt login
  logger.info('Authenticating...');
  try {
    const response = await axios.post(
      `${serverUrl}/api/auth/login`,
      credentials,
      { timeout: 10000 }
    );

    if (response.data.success && response.data?.token) {
      // Save configuration
      setServerUrl(serverUrl);
      setToken(response.data.token);

      logger.blank();
      logger.success('Configuration saved successfully!');
      logger.blank();
      logger.info('You can now deploy projects with:');
      logger.dim('  runway deploy');
      logger.blank();
    } else {
      logger.error('Authentication failed: ' + (response.data.error || 'Unknown error'));
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error('Authentication failed: ' + (error.response?.data?.error || error.message));
    } else {
      logger.error('Authentication failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}
