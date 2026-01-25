import * as React from "react";

export type DeployStep = "upload" | "configure" | "build" | "deploy" | "complete";

export interface DeployState {
  step: DeployStep;
  progress: number;
  logs: string[];
  error?: string;
}

const buildLogs = [
  "[INFO] Starting build process...",
  "[INFO] Detecting runtime: Node.js 20.x",
  "[INFO] Installing dependencies...",
  "[INFO] npm install --production",
  "[INFO] added 142 packages in 4.2s",
  "[INFO] Building application...",
  "[INFO] Running build script...",
  "[SUCCESS] Build completed successfully!",
];

const deployLogs = [
  "[INFO] Preparing deployment...",
  "[INFO] Creating container image...",
  "[INFO] Pushing to registry...",
  "[INFO] Updating service configuration...",
  "[INFO] Starting health checks...",
  "[SUCCESS] Service is healthy!",
  "[SUCCESS] Deployment complete!",
];

export function useDeployFlowMock() {
  const [state, setState] = React.useState<DeployState>({
    step: "upload",
    progress: 0,
    logs: [],
  });
  const [isDeploying, setIsDeploying] = React.useState(false);

  const startDeploy = React.useCallback((file?: File, config?: { runtime: string; name: string }) => {
    setIsDeploying(true);
    setState({ step: "upload", progress: 0, logs: [] });

    // Simulate upload
    let progress = 0;
    const uploadInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(uploadInterval);
        setState((prev) => ({ ...prev, step: "configure", progress: 100 }));
      } else {
        setState((prev) => ({ ...prev, progress }));
      }
    }, 200);

    return () => clearInterval(uploadInterval);
  }, []);

  const confirmConfig = React.useCallback(() => {
    setState((prev) => ({ ...prev, step: "build", progress: 0, logs: [] }));

    // Simulate build logs
    let logIndex = 0;
    const logInterval = setInterval(() => {
      if (logIndex < buildLogs.length) {
        setState((prev) => ({
          ...prev,
          logs: [...prev.logs, buildLogs[logIndex]],
          progress: ((logIndex + 1) / buildLogs.length) * 100,
        }));
        logIndex++;
      } else {
        clearInterval(logInterval);
        setState((prev) => ({ ...prev, step: "deploy", progress: 0, logs: [] }));
        
        // Start deploy phase
        let deployLogIndex = 0;
        const deployInterval = setInterval(() => {
          if (deployLogIndex < deployLogs.length) {
            setState((prev) => ({
              ...prev,
              logs: [...prev.logs, deployLogs[deployLogIndex]],
              progress: ((deployLogIndex + 1) / deployLogs.length) * 100,
            }));
            deployLogIndex++;
          } else {
            clearInterval(deployInterval);
            setState((prev) => ({ ...prev, step: "complete", progress: 100 }));
            setIsDeploying(false);
          }
        }, 600);
      }
    }, 400);
  }, []);

  const reset = React.useCallback(() => {
    setState({ step: "upload", progress: 0, logs: [] });
    setIsDeploying(false);
  }, []);

  const setStep = React.useCallback((step: DeployStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  return { state, isDeploying, startDeploy, confirmConfig, reset, setStep };
}
