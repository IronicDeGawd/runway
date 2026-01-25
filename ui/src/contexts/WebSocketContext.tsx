import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

type RealtimeEvent = 
  | 'metrics:update'
  | 'process:change'
  | 'activity:new'
  | 'service:change'
  | 'project:change';

interface WebSocketMessage {
  type: RealtimeEvent;
  data: any;
}

type EventListener = (data: any) => void;

interface WebSocketContextValue {
  isConnected: boolean;
  subscribe: (channels: string[]) => void;
  unsubscribe: (channels: string[]) => void;
  on: (event: RealtimeEvent, listener: EventListener) => void;
  off: (event: RealtimeEvent, listener: EventListener) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
}

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<RealtimeEvent, Set<EventListener>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('No token found, skipping WebSocket connection');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/realtime?token=${token}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      wsRef.current = null;

      // Reconnect with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;
      
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        // Dispatch to listeners
        const listeners = listenersRef.current.get(message.type);
        if (listeners) {
          listeners.forEach(listener => listener(message.data));
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const subscribe = useCallback((channels: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'subscribe',
        channels
      }));
    }
  }, []);

  const unsubscribe = useCallback((channels: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'unsubscribe',
        channels
      }));
    }
  }, []);

  const on = useCallback((event: RealtimeEvent, listener: EventListener) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(listener);
  }, []);

  const off = useCallback((event: RealtimeEvent, listener: EventListener) => {
    const listeners = listenersRef.current.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }, []);

  const value: WebSocketContextValue = {
    isConnected,
    subscribe,
    unsubscribe,
    on,
    off
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}
