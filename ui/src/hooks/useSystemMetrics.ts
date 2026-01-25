import * as React from "react";

export interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  network: { in: number; out: number };
  uptime: number;
}

export function useSystemMetrics() {
  const [metrics, setMetrics] = React.useState<SystemMetrics>({
    cpu: 45,
    memory: 62,
    disk: 38,
    network: { in: 125, out: 89 },
    uptime: 99.98,
  });
  const [history, setHistory] = React.useState<number[]>([40, 42, 45, 43, 48, 52, 45, 42, 45]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  // Simulate live updates
  React.useEffect(() => {
    const interval = setInterval(() => {
      setMetrics((prev) => ({
        cpu: Math.max(5, Math.min(95, prev.cpu + (Math.random() * 10 - 5))),
        memory: Math.max(20, Math.min(90, prev.memory + (Math.random() * 4 - 2))),
        disk: Math.max(20, Math.min(80, prev.disk + (Math.random() * 2 - 1))),
        network: {
          in: Math.max(50, Math.min(300, prev.network.in + (Math.random() * 20 - 10))),
          out: Math.max(30, Math.min(200, prev.network.out + (Math.random() * 15 - 7))),
        },
        uptime: 99.98,
      }));

      setHistory((prev) => {
        const newVal = Math.max(5, Math.min(95, prev[prev.length - 1] + (Math.random() * 10 - 5)));
        return [...prev.slice(-11), newVal];
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return { metrics, history, isLoading };
}
