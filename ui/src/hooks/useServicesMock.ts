import * as React from "react";

export interface Service {
  id: string;
  name: string;
  type: "postgres" | "redis";
  status: "running" | "stopped";
  version: string;
  connectionString: string;
  port: number;
  memory: number;
}

const mockServices: Service[] = [
  {
    id: "1",
    name: "Primary Database",
    type: "postgres",
    status: "running",
    version: "15.4",
    connectionString: "postgresql://user:pass@localhost:5432/pdcp",
    port: 5432,
    memory: 512,
  },
  {
    id: "2",
    name: "Cache Store",
    type: "redis",
    status: "running",
    version: "7.2",
    connectionString: "redis://localhost:6379",
    port: 6379,
    memory: 128,
  },
];

export function useServicesMock() {
  const [services, setServices] = React.useState<Service[]>(mockServices);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 700);
    return () => clearTimeout(timer);
  }, []);

  const startService = React.useCallback((id: string) => {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "running" as const } : s))
    );
  }, []);

  const stopService = React.useCallback((id: string) => {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "stopped" as const } : s))
    );
  }, []);

  return { services, isLoading, startService, stopService };
}
