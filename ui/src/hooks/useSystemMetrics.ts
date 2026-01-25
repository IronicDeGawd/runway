import { useQuery } from '@tanstack/react-query';
import { api, ProcessStatus } from '@/lib/api';

export function useSystemMetrics() {
    // We reuse the process list to calculate aggregate metrics for now
    // In a real system we'd have a /metrics endpoint for robust system stats (os.loadavg, etc)
    
     const { data: processesData, isLoading } = useQuery({
        queryKey: ['processes'],
        queryFn: async () => {
             const res = await api.get<{success: boolean, data: ProcessStatus[]}>('/process');
             return res.data.data;
        },
        refetchInterval: 2000,
    });
    
    // Fake OS metrics based on process load + baseline
    const totalMem = 8 * 1024; // 8GB fake
    const usedMem = (processesData || []).reduce((acc, p) => acc + (p.memory / 1024 / 1024), 0);
    const memPercent = Math.min((usedMem / totalMem) * 100 + 10, 100); // Baseline 10%

    const totalCpu = (processesData || []).reduce((acc, p) => acc + p.cpu, 0);
    const cpuPercent = Math.min(totalCpu + 5, 100);

    const metrics = {
        cpu: cpuPercent,
        memory: memPercent,
        disk: 45, // Static for now
        uptime: 99.9,
        requests: 1200,
    };

    return {
        metrics,
        history: [], // Todo: keep history in state
        isLoading
    };
}
