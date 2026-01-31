import { logger } from '../utils/logger';
import { portRepository } from '../repositories';

export class PortManager {
  async allocatePort(serviceId: string): Promise<number> {
    const port = portRepository.allocate(serviceId);
    logger.debug(`Port ${port} allocated for ${serviceId}`);
    return port;
  }

  async releasePort(port: number): Promise<void> {
    portRepository.release(port);
    logger.debug(`Port ${port} released`);
  }

  async getPortForService(serviceId: string): Promise<number | null> {
    return portRepository.getByService(serviceId);
  }
}

export const portManager = new PortManager();
