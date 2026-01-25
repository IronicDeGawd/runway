import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import pm2 from 'pm2';
import { getAuthConfig } from './config/auth';
import { logger } from './utils/logger';

interface ExtendedWebSocket extends WebSocket {
  projectId?: string;
  isAlive: boolean;
}

export const initWebSocket = (server: HttpServer) => {
  const wss = new WebSocketServer({ server, path: '/api/logs' });

  wss.on('connection', (ws: ExtendedWebSocket, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // Auth
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(1008, 'Token required');
      return;
    }

    const config = getAuthConfig();
    if (!config) {
      ws.close(1011, 'Auth not configured');
      return;
    }

    try {
      jwt.verify(token, config.jwtSecret);
    } catch (error) {
      ws.close(1008, 'Invalid token');
      return;
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.action === 'subscribe' && typeof data.projectId === 'string') {
          ws.projectId = data.projectId;
          logger.debug(`Client subscribed to logs for ${data.projectId}`);
        }
      } catch (err) {
        logger.warn('Invalid WebSocket message received');
      }
    });
  });

  // Keep-alive
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtendedWebSocket;
      if (extWs.isAlive === false) return ws.terminate();
      extWs.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  // PM2 Bus
  pm2.launchBus((err, bus) => {
    if (err) {
      logger.error('Failed to launch PM2 bus', err);
      return;
    }

    bus.on('log:out', (packet: any) => {
      broadcastLog(wss, 'stdout', packet);
    });

    bus.on('log:err', (packet: any) => {
      broadcastLog(wss, 'stderr', packet);
    });
  });
};

const broadcastLog = (wss: WebSocketServer, type: 'stdout' | 'stderr', packet: any) => {
  const processName = packet.process.name;
  const data = packet.data;

  wss.clients.forEach((client) => {
    const ws = client as ExtendedWebSocket;
    if (ws.readyState === WebSocket.OPEN && ws.projectId === processName) {
      ws.send(JSON.stringify({
        type,
        timestamp: new Date().toISOString(),
        data,
      }));
    }
  });
};
