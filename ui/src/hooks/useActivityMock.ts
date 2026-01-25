import * as React from "react";

export interface ActivityItem {
  id: string;
  type: "deploy" | "start" | "stop" | "error" | "config";
  project: string;
  message: string;
  timestamp: Date;
}

const mockActivity: ActivityItem[] = [
  { id: "1", type: "deploy", project: "api-gateway", message: "Deployed v2.1.0 to production", timestamp: new Date(Date.now() - 1000 * 60 * 2) },
  { id: "2", type: "start", project: "frontend-app", message: "Service started", timestamp: new Date(Date.now() - 1000 * 60 * 15) },
  { id: "3", type: "error", project: "ml-service", message: "Health check failed", timestamp: new Date(Date.now() - 1000 * 60 * 30) },
  { id: "4", type: "stop", project: "ml-service", message: "Service stopped by user", timestamp: new Date(Date.now() - 1000 * 60 * 45) },
  { id: "5", type: "config", project: "auth-service", message: "Environment variables updated", timestamp: new Date(Date.now() - 1000 * 60 * 60) },
  { id: "6", type: "deploy", project: "frontend-app", message: "Deployed v1.5.2", timestamp: new Date(Date.now() - 1000 * 60 * 90) },
];

export function useActivityMock() {
  const [activity, setActivity] = React.useState<ActivityItem[]>(mockActivity);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  return { activity, isLoading };
}

export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
