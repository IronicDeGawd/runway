import inquirer from 'inquirer';
import { getConfig, setAuthData, isConfigured } from '../utils/config';
import { logger } from '../utils/logger';
import { AuthService } from '../services/authService';

export async function loginCommand(): Promise<void> {
  logger.header('Runway Login');

  // Check if init has been run (we need a server URL at minimum)
  const config = getConfig();
  if (!config.serverUrl) {
    logger.error('CLI not configured. Run "runway init" first to set up your server URL.');
    return;
  }

  logger.dim(`Server: ${config.serverUrl}`);
  logger.blank();

  // Initialize auth service
  const authService = new AuthService(config.serverUrl);

  // Check security mode
  let securityInfo;
  try {
    securityInfo = await authService.getSecurityMode();
  } catch (error) {
    logger.error('Failed to connect to server. Make sure it is running.');
    return;
  }

  if (securityInfo.securityMode === 'domain-https') {
    logger.success(`Server has HTTPS enabled: ${securityInfo.domain}`);
  } else {
    logger.warn('Server is running in HTTP mode.');
  }

  // Get credentials
  logger.blank();
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

  // Authenticate
  logger.info('Authenticating...');
  try {
    const authResult = await authService.authenticate(
      credentials.username,
      credentials.password
    );

    // Save new auth data (keep existing server URL)
    setAuthData(authResult.token, authResult.expiresAt, authResult.securityMode);

    logger.blank();
    logger.success('Authentication successful! Token updated.');

    // Show token expiry warning for HTTP mode
    if (authResult.securityMode === 'ip-http') {
      logger.warn('Note: Token expires in 15 minutes due to HTTP mode.');
    }
  } catch (error) {
    logger.blank();
    logger.dim('Check your credentials and try again.');
  }

  logger.blank();
}
