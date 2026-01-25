import * as React from "react";

export interface Project {
  id: string;
  name: string;
  runtime: "node" | "python" | "go" | "rust" | "static" | "docker";
  status: "running" | "stopped" | "building" | "error";
  domain: string;
  port: number;
  createdAt: Date;
  lastDeployed: Date;
  memory: number;
  cpu: number;
}

const mockProjects: Project[] = [
  {
    id: "1",
    name: "api-gateway",
    runtime: "node",
    status: "running",
    domain: "api.example.com",
    port: 3000,
    createdAt: new Date("2024-01-15"),
    lastDeployed: new Date("2024-01-20"),
    memory: 256,
    cpu: 12,
  },
  {
    id: "2",
    name: "frontend-app",
    runtime: "static",
    status: "running",
    domain: "app.example.com",
    port: 8080,
    createdAt: new Date("2024-01-10"),
    lastDeployed: new Date("2024-01-19"),
    memory: 128,
    cpu: 5,
  },
  {
    id: "3",
    name: "ml-service",
    runtime: "python",
    status: "stopped",
    domain: "ml.example.com",
    port: 5000,
    createdAt: new Date("2024-01-05"),
    lastDeployed: new Date("2024-01-18"),
    memory: 512,
    cpu: 0,
  },
  {
    id: "4",
    name: "auth-service",
    runtime: "go",
    status: "building",
    domain: "auth.example.com",
    port: 4000,
    createdAt: new Date("2024-01-12"),
    lastDeployed: new Date("2024-01-17"),
    memory: 64,
    cpu: 8,
  },
];

export function useProjectsMock() {
  const [projects, setProjects] = React.useState<Project[]>(mockProjects);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const startProject = React.useCallback((id: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: "building" as const } : p
      )
    );
    setTimeout(() => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: "running" as const, cpu: Math.floor(Math.random() * 20) + 5 } : p
        )
      );
    }, 2000);
  }, []);

  const stopProject = React.useCallback((id: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: "stopped" as const, cpu: 0 } : p
      )
    );
  }, []);

  const restartProject = React.useCallback((id: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: "building" as const } : p
      )
    );
    setTimeout(() => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: "running" as const, cpu: Math.floor(Math.random() * 20) + 5 } : p
        )
      );
    }, 1500);
  }, []);

  const deleteProject = React.useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const getProject = React.useCallback((id: string) => {
    return projects.find((p) => p.id === id);
  }, [projects]);

  return {
    projects,
    isLoading,
    startProject,
    stopProject,
    restartProject,
    deleteProject,
    getProject,
  };
}
