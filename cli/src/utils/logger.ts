import chalk from 'chalk';

export const logger = {
  info: (message: string) => {
    console.log(chalk.blue('ℹ'), message);
  },

  success: (message: string) => {
    console.log(chalk.green('✓'), message);
  },

  warn: (message: string) => {
    console.log(chalk.yellow('⚠'), message);
  },

  error: (message: string) => {
    console.log(chalk.red('✗'), message);
  },

  step: (step: number, total: number, message: string) => {
    console.log(chalk.cyan(`[${step}/${total}]`), message);
  },

  dim: (message: string) => {
    console.log(chalk.dim(message));
  },

  blank: () => {
    console.log('');
  },

  header: (message: string) => {
    console.log('');
    console.log(chalk.bold.cyan('━'.repeat(50)));
    console.log(chalk.bold.cyan(`  ${message}`));
    console.log(chalk.bold.cyan('━'.repeat(50)));
    console.log('');
  },
};
