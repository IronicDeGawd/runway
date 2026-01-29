import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useWebSocket } from '@/contexts/WebSocketContext';

interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
  totalMemory: number;
  usedMemory: number;
}

export function useSystemMetrics() {
  const queryClient = useQueryClient();
  const { subscribe, on, off } = useWebSocket();

  // Initial fetch via HTTP
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const res = await api.get<{success: boolean, data: SystemMetrics}>('/metrics');
      return res.data.data;
    },
    staleTime: 10000, // Keep data fresh for 10s
  });

  // Subscribe to WebSocket updates
  useEffect(() => {
    subscribe(['metrics']);

    const handleMetricsUpdate = (data: SystemMetrics) => {
      queryClient.setQueryData(['metrics'], data);
    };

    on('metrics:update', handleMetricsUpdate);

    return () => {
      off('metrics:update', handleMetricsUpdate);
    };
  }, [subscribe, on, off, queryClient]);

  return {
    metrics: metrics || { cpu: 0, memory: 0, disk: 0, uptime: 0, totalMemory: 0, usedMemory: 0 },
    isLoading
  };
}
