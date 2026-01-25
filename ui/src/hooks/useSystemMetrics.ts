import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
  totalMemory: number;
  usedMemory: number;
}

export function useSystemMetrics() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const res = await api.get<{success: boolean, data: SystemMetrics}>('/metrics');
      return res.data.data;
    },
    refetchInterval: 5000,
  });

  return {
    metrics: metrics || { cpu: 0, memory: 0, disk: 0, uptime: 0, totalMemory: 0, usedMemory: 0 },
    history: [], // TODO: Implement history tracking if needed
    isLoading
  };
}
