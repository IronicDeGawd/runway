import * as React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileArchive,
  Check,
  ChevronRight,
  Server,
  Code,
  Globe,
  Zap,
} from "lucide-react";
import { DashboardLayout } from "@/components/pdcp/DashboardLayout";
import { PanelCard, PanelCardHeader, PanelCardTitle, PanelCardContent } from "@/components/pdcp/PanelCard";
import { CutoutPanel } from "@/components/pdcp/CutoutPanel";
import { PDCPButton } from "@/components/pdcp/PDCPButton";
import { PDCPInput, FormField } from "@/components/pdcp/FormControls";
import { ProgressStepper, ProgressBar, Spinner } from "@/components/pdcp/ProgressElements";
import { Terminal } from "@/components/pdcp/Terminal";
import { StatusPill } from "@/components/pdcp/StatusPill";
import { useDeployFlow, DeployStep } from "@/hooks/useDeployFlow";
import { cn } from "@/lib/utils";

const runtimes = [
  { id: "node", label: "Node.js", icon: Server, description: "JavaScript/TypeScript runtime" },
  { id: "python", label: "Python", icon: Code, description: "Python 3.x applications" },
  { id: "static", label: "Static", icon: Globe, description: "HTML, CSS, JS files" },
  { id: "docker", label: "Docker", icon: Zap, description: "Custom container" },
];

const steps = [
  { id: "upload", label: "Upload" },
  { id: "configure", label: "Configure" },
  { id: "build", label: "Build" },
  { id: "deploy", label: "Deploy" },
];

export default function DeployPage() {
  const navigate = useNavigate();
  const { state, isDeploying, startDeploy, confirmConfig, reset } = useDeployFlow();
  const [selectedRuntime, setSelectedRuntime] = React.useState("node");
  const [projectName, setProjectName] = React.useState("");
  const [dragOver, setDragOver] = React.useState(false);
  const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);

  const currentStepIndex = steps.findIndex((s) => s.id === state.step);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const handleStartUpload = () => {
    if (uploadedFile) {
      startDeploy(uploadedFile, { runtime: selectedRuntime, name: projectName });
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary">Deploy New Project</h1>
          <p className="text-text-muted text-sm mt-1">Upload your code and we'll handle the rest</p>
        </div>

        {/* Progress stepper */}
        <ProgressStepper steps={steps} currentStep={currentStepIndex} className="justify-center" />

        {/* Step content - wrapped in CutoutPanel for depth */}
        <CutoutPanel variant="light" padding="lg" animate>
          {state.step === "upload" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Upload zone */}
              <div
                className={cn(
                  "relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
                  dragOver
                    ? "border-accent-primary bg-accent-primary/5"
                    : uploadedFile
                    ? "border-status-running bg-status-running/5"
                    : "border-panel-border hover:border-card-border hover:bg-panel-hover"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  accept=".zip,.tar,.tar.gz"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <motion.div
                  animate={{ scale: dragOver ? 1.05 : 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {uploadedFile ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-status-running/20 flex items-center justify-center">
                        <Check className="w-6 h-6 text-status-running" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">{uploadedFile.name}</p>
                        <p className="text-sm text-text-muted">
                          {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-panel flex items-center justify-center">
                        <Upload className="w-6 h-6 text-text-muted" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">Drop your ZIP file here</p>
                        <p className="text-sm text-text-muted">or click to browse</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Runtime selection */}
              <FormField label="Select Runtime">
                <div className="grid grid-cols-2 gap-3">
                  {runtimes.map((runtime) => (
                    <motion.button
                      key={runtime.id}
                      type="button"
                      onClick={() => setSelectedRuntime(runtime.id)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                        selectedRuntime === runtime.id
                          ? "border-accent-primary bg-accent-primary/5"
                          : "border-panel-border hover:border-card-border hover:bg-panel-hover"
                      )}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        selectedRuntime === runtime.id ? "bg-accent-primary/20" : "bg-panel"
                      )}>
                        <runtime.icon className={cn(
                          "w-5 h-5",
                          selectedRuntime === runtime.id ? "text-accent-primary" : "text-text-muted"
                        )} />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary text-sm">{runtime.label}</p>
                        <p className="text-xs text-text-muted">{runtime.description}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </FormField>

              {/* Project name */}
              <FormField label="Project Name" required>
                <PDCPInput
                  placeholder="my-awesome-app"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </FormField>

              {/* Action */}
              <div className="flex justify-end">
                <PDCPButton
                  onClick={handleStartUpload}
                  disabled={!uploadedFile || !projectName}
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </PDCPButton>
              </div>
            </motion.div>
          )}

          {state.step === "configure" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-accent-primary/20 flex items-center justify-center mx-auto mb-4">
                  <FileArchive className="w-8 h-8 text-accent-primary" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary">Upload Complete</h3>
                <p className="text-sm text-text-muted mt-1">Ready to build and deploy</p>
              </div>

              <div className="bg-surface rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Project</span>
                  <span className="text-text-primary font-medium">{projectName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Runtime</span>
                  <StatusPill variant="default">{selectedRuntime}</StatusPill>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">File</span>
                  <span className="text-text-primary">{uploadedFile?.name}</span>
                </div>
              </div>

              <div className="flex justify-between">
                <PDCPButton variant="secondary" onClick={reset}>
                  Back
                </PDCPButton>
                <PDCPButton onClick={confirmConfig}>
                  Start Build
                  <ChevronRight className="w-4 h-4" />
                </PDCPButton>
              </div>
            </motion.div>
          )}

          {(state.step === "build" || state.step === "deploy") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4">
                <Spinner size="md" />
                <div>
                  <h3 className="font-semibold text-text-primary">
                    {state.step === "build" ? "Building..." : "Deploying..."}
                  </h3>
                  <p className="text-sm text-text-muted">
                    {state.step === "build" ? "Compiling your application" : "Publishing to production"}
                  </p>
                </div>
              </div>

              <ProgressBar value={state.progress} size="md" />

              <Terminal logs={state.logs} maxHeight="250px" streaming />
            </motion.div>
          )}

          {state.step === "complete" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="w-20 h-20 rounded-full bg-status-running/20 flex items-center justify-center mx-auto"
              >
                <Check className="w-10 h-10 text-status-running" />
              </motion.div>

              <div>
                <h3 className="text-xl font-bold text-text-primary">Deployment Successful!</h3>
                <p className="text-text-muted mt-1">Your application is now live</p>
              </div>

              <div className="bg-surface rounded-lg p-4">
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Your URL</p>
                <a
                  href={`https://${projectName}.pdcp.local`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline font-medium"
                >
                  https://{projectName}.pdcp.local
                </a>
              </div>

              <div className="flex justify-center gap-3">
                <PDCPButton variant="secondary" onClick={reset}>
                  Deploy Another
                </PDCPButton>
                <PDCPButton onClick={() => navigate("/projects")}>
                  View Projects
                </PDCPButton>
              </div>
            </motion.div>
          )}
        </CutoutPanel>
      </div>
    </DashboardLayout>
  );
}
