import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export interface Service {
  id: string;
  name: string;
  type: "postgres" | "redis";
  status: "running" | "stopped" | "error";
  version: string;
  connectionString: string;
  port: number;
}

export function useServices() {
  const queryClient = useQueryClient();

  const { data: services, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await api.get<{success: boolean, data: Service[]}>('/services');
      return res.data.data;
    },
    refetchInterval: 5000,
  });

  const startMutation = useMutation({
    mutationFn: async (type: string) => {
        await api.post(`/services/${type}/start`);
    },
    onSuccess: () => {
        toast.success(`Service starting...`);
        queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (err: any) => {
        toast.error(err.response?.data?.error || `Failed to start service`);
    }
  });

  const stopMutation = useMutation({
    mutationFn: async (type: string) => {
        await api.post(`/services/${type}/stop`);
    },
    onSuccess: () => {
        toast.success(`Service stopping...`);
        queryClient.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (err: any) => {
        toast.error(err.response?.data?.error || `Failed to stop service`);
    }
  });

  return {
    services: services || [],
    isLoading,
    startService: (id: string) => startMutation.mutateAsync(id), // ID is type (postgres/redis) in our simpler model
    stopService: (id: string) => stopMutation.mutateAsync(id)
  };
}
