import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface SystemInfo {
  version: string;
  nodeVersion: string;
  platform: string;
  hostname: string;
  lastUpdated: string | null;
  cpuCores: number;
  totalMemory: number;
}

interface SystemInfoResponse {
  success: boolean;
  data: SystemInfo;
}

export function useSystemInfo() {
  const {
    data: systemInfo,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const response = await api.get<SystemInfoResponse>('/system');
      return response.data.data; // Return inner SystemInfo object directly
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    systemInfo,
    isLoading,
    error,
    refetch,
  };
}

// Format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Format date to readable format
export function formatDate(isoString: string | null): string {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
