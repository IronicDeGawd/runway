import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { projectRegistry } from './projectRegistry';
import { logger } from '../utils/logger';

const execAsync = util.promisify(exec);
const CADDYFILE_PATH = path.resolve(process.cwd(), '../data/Caddyfile');

export class CaddyService {
  
  private async generateCaddyfile(): Promise<string> {
    const projects = await projectRegistry.getAll();
    const uiDist = path.resolve(process.cwd(), '../ui/dist');

    let fileContent = `
{
    # Global options
    admin off
}

# Control Plane
:80 {
    # Serve UI Static Files
    root * ${uiDist}
    file_server
    try_files {path} /index.html

    # Proxy API & Websockets
    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }
    
    handle /socket.io/* {
        reverse_proxy 127.0.0.1:3000
    }
}
    `.trim() + '\n\n';

    for (const project of projects) {
      if (project.domains && project.domains.length > 0) {
        for (const domain of project.domains) {
          // If port is generic 80/443, Caddy handles it.
          // We'll define the domain block.
          // If it's a static site (react), we should serve files?
          // Phase 3 said "Static React apps are not run via PM2".
          // So Caddy should serve them.
          
          if (project.type === 'react') {
             const distDir = path.resolve(process.cwd(), '../apps', project.id, 'dist'); 
             // or 'build'. Vite uses 'dist'.
             
             fileContent += `
${domain} {
    root * ${distDir}
    file_server
    try_files {path} /index.html
}
`;
          } else {
             // Proxy to PM2 port
             if (project.port) {
                 fileContent += `
${domain} {
    reverse_proxy 127.0.0.1:${project.port}
}
`;
             }
          }
        }
      }
    }
    return fileContent;
  }

  async updateConfig(): Promise<void> {
    try {
      const content = await this.generateCaddyfile();
      await fs.writeFile(CADDYFILE_PATH, content);
      
      // Reload Caddy
      // Check if caddy runs?
      await execAsync('caddy reload --config ' + CADDYFILE_PATH);
      logger.info('Caddy configuration reloaded');
    } catch (error) {
      logger.error('Failed to update Caddy config', error);
      // Don't crash app if Caddy is missing, just log.
    }
  }
}

export const caddyService = new CaddyService();
