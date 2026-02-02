import inquirer from 'inquirer';
import axios from 'axios';
import { setServerUrl, setAuthData, getConfig, isConfigured } from '../utils/config';
import { logger } from '../utils/logger';
import { AuthService } from '../services/authService';

interface InitOptions {
  server?: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  logger.header('Runway CLI Setup');

  // Check if already configured
  if (isConfigured()) {
    const config = getConfig();
    logger.info(`Currently configured to: ${config.serverUrl}`);
    if (config.securityMode) {
      logger.dim(`Security mode: ${config.securityMode === 'domain-https' ? 'HTTPS (secure)' : 'HTTP (limited)'}`);
    }

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

  // Initialize auth service
  const authService = new AuthService(serverUrl);

  // Check security mode
  logger.info('Checking server security mode...');
  let securityInfo;
  try {
    securityInfo = await authService.getSecurityMode();
  } catch (error) {
    logger.error('Failed to get server security mode');
    logger.dim('The server may be running an older version without CLI auth support.');
    logger.dim('Falling back to legacy authentication...');
    await legacyAuth(serverUrl);
    return;
  }

  // Display security info
  if (securityInfo.securityMode === 'domain-https') {
    logger.success(`Server has HTTPS enabled: ${securityInfo.domain}`);
    logger.dim('Authentication will use secure TLS connection.');
  } else {
    logger.warn('Server is running in HTTP mode (no domain configured)');
    logger.dim('Authentication will use RSA key exchange (MITM vulnerable).');
    logger.blank();

    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Continue with RSA authentication?',
        default: true,
      },
    ]);

    if (!proceed) {
      logger.blank();
      logger.info('To enable secure authentication:');
      logger.dim('  1. Configure a domain on your Runway server');
      logger.dim('  2. Enable HTTPS through the Settings page');
      logger.dim('  3. Run `runway init` again');
      return;
    }
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

  // Authenticate using the auth service
  logger.info('Authenticating...');
  try {
    const authResult = await authService.authenticate(
      credentials.username,
      credentials.password
    );

    // Check if password reset is required
    if (authResult.mustResetPassword) {
      logger.blank();
      logger.warn('⚠️  Password reset required');
      logger.info('You are using the default password. Please set a new password to continue.');
      logger.blank();

      // Prompt for new password
      const resetResult = await promptPasswordReset(authService, credentials.password);

      if (resetResult) {
        // Save configuration with new token
        setServerUrl(serverUrl);
        setAuthData(resetResult.token, resetResult.expiresAt, resetResult.securityMode);

        logger.blank();
        logger.success('Password updated and configuration saved!');
      } else {
        // User skipped password reset, save with current token but warn
        setServerUrl(serverUrl);
        setAuthData(authResult.token, authResult.expiresAt, authResult.securityMode);

        logger.blank();
        logger.warn('Configuration saved, but password reset is still required.');
        logger.dim('You will be prompted to reset your password on next login.');
      }
    } else {
      // Save configuration with all auth data
      setServerUrl(serverUrl);
      setAuthData(authResult.token, authResult.expiresAt, authResult.securityMode);

      logger.blank();
      logger.success('Configuration saved successfully!');
    }

    logger.blank();
    logger.info('You can now deploy projects with:');
    logger.dim('  runway deploy');
    logger.blank();

    // Show token expiry warning for HTTP mode
    if (authResult.securityMode === 'ip-http') {
      logger.warn('Note: Token expires in 15 minutes due to HTTP mode.');
      logger.dim('Run `runway init` to re-authenticate when needed.');
    }
  } catch (error) {
    // Error already logged by AuthService
    logger.blank();
    logger.dim('Check your credentials and try again.');
  }
}

/**
 * Prompt user to reset their password
 */
async function promptPasswordReset(
  authService: AuthService,
  currentPassword: string
): Promise<{ token: string; expiresAt: string; securityMode: 'ip-http' | 'domain-https' } | null> {
  const { resetNow } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'resetNow',
      message: 'Would you like to reset your password now?',
      default: true,
    },
  ]);

  if (!resetNow) {
    return null;
  }

  // Get new password with confirmation
  const newPasswordAnswers = await inquirer.prompt([
    {
      type: 'password',
      name: 'newPassword',
      message: 'Enter new password (min. 6 characters):',
      validate: (input: string) => {
        if (input.length < 6) {
          return 'Password must be at least 6 characters';
        }
        return true;
      },
    },
    {
      type: 'password',
      name: 'confirmPassword',
      message: 'Confirm new password:',
      validate: (input: string, answers: { newPassword?: string }) => {
        if (input !== answers?.newPassword) {
          return 'Passwords do not match';
        }
        return true;
      },
    },
  ]);

  logger.info('Updating password...');
  try {
    const resetResult = await authService.resetPassword(
      currentPassword,
      newPasswordAnswers.newPassword
    );

    return {
      token: resetResult.token,
      expiresAt: resetResult.expiresAt,
      securityMode: resetResult.securityMode,
    };
  } catch (error) {
    logger.error('Failed to reset password. Please try again later.');
    return null;
  }
}

/**
 * Legacy authentication for servers without CLI auth support
 */
async function legacyAuth(serverUrl: string): Promise<void> {
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

  logger.info('Authenticating...');
  try {
    const response = await axios.post(
      `${serverUrl}/api/auth/login`,
      credentials,
      { timeout: 10000 }
    );

    if (response.data.success && response.data?.token) {
      // Save configuration (legacy mode without expiry tracking)
      setServerUrl(serverUrl);
      setAuthData(response.data.token, '', 'ip-http');

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
