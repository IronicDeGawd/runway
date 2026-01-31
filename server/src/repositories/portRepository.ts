import { database } from '../services/database';
import { AppError } from '../middleware/errorHandler';

interface PortRow {
  port: number;
  service_id: string;
  allocated_at: string;
}

export class PortRepository {
  private readonly MIN_PORT = 10000;
  private readonly MAX_PORT = 60000;

  allocate(serviceId: string): number {
    const now = new Date().toISOString();

    // Check if service already has a port
    const existing = this.getByService(serviceId);
    if (existing !== null) {
      return existing;
    }

    // Get all allocated ports
    const allocatedPorts = new Set(
      database.all<{ port: number }>('SELECT port FROM ports').map(r => r.port)
    );

    // Find a random free port
    let attempts = 0;
    let port = 0;

    while (attempts < 100) {
      port = Math.floor(Math.random() * (this.MAX_PORT - this.MIN_PORT + 1)) + this.MIN_PORT;
      if (!allocatedPorts.has(port)) {
        break;
      }
      attempts++;
    }

    if (allocatedPorts.has(port)) {
      throw new AppError('Failed to allocate a free port after multiple attempts', 503);
    }

    database.run(
      'INSERT INTO ports (port, service_id, allocated_at) VALUES (?, ?, ?)',
      [port, serviceId, now]
    );

    return port;
  }

  release(port: number): void {
    database.run('DELETE FROM ports WHERE port = ?', [port]);
  }

  releaseByService(serviceId: string): void {
    database.run('DELETE FROM ports WHERE service_id = ?', [serviceId]);
  }

  getByService(serviceId: string): number | null {
    const row = database.get<PortRow>('SELECT * FROM ports WHERE service_id = ?', [serviceId]);
    return row ? row.port : null;
  }

  getServiceByPort(port: number): string | null {
    const row = database.get<PortRow>('SELECT * FROM ports WHERE port = ?', [port]);
    return row ? row.service_id : null;
  }

  isAllocated(port: number): boolean {
    const row = database.get<{ count: number }>('SELECT COUNT(*) as count FROM ports WHERE port = ?', [port]);
    return (row?.count ?? 0) > 0;
  }

  getAll(): Map<number, string> {
    const rows = database.all<PortRow>('SELECT * FROM ports');
    const map = new Map<number, string>();
    rows.forEach(r => map.set(r.port, r.service_id));
    return map;
  }
}

export const portRepository = new PortRepository();
