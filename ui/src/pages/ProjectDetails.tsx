import * as React from "react";
import { motion } from "framer-motion";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Play,
  Square,
  RotateCcw,
  Trash2,
  ExternalLink,
  Terminal as TerminalIcon,
  Settings,
  Key,
} from "lucide-react";
import { DashboardLayout } from "@/components/pdcp/DashboardLayout";
import { PanelCard, PanelCardHeader, PanelCardTitle, PanelCardContent } from "@/components/pdcp/PanelCard";
import { StatusPill, RuntimeBadge } from "@/components/pdcp/StatusPill";
import { PDCPButton, IconButton } from "@/components/pdcp/PDCPButton";
import { Terminal, EnvRow } from "@/components/pdcp/Terminal";
import { ConfirmDialog } from "@/components/pdcp/Overlays";
import { Skeleton, Spinner } from "@/components/pdcp/ProgressElements";
import { useProjects } from "@/hooks/useProjects";
import { useProjectEnv } from "@/hooks/useProjectEnv";
import { useProjectLogs } from "@/hooks/useProjectLogs";
import { cn } from "@/lib/utils";

type Tab = "control" | "logs" | "env" | "settings";

export default function ProjectDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoading, startProject, stopProject, restartProject, deleteProject, getProject } = useProjects();
  const [activeTab, setActiveTab] = React.useState<Tab>("control");
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const project = getProject(id || "");

  // Real Hooks
  const { envVars, isLoading: envLoading } = useProjectEnv(id);
  const { logs, isConnected, clearLogs } = useProjectLogs(id, activeTab === "logs");

  const handleDelete = async () => {
    if (project) {
      await deleteProject(project.id);
      navigate("/projects");
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <p className="text-text-muted text-lg">Project not found</p>
          <Link to="/projects" className="text-accent-primary hover:underline mt-2">
            Back to projects
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link to="/projects">
              <IconButton variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </IconButton>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-text-primary">{project.name}</h1>
                <RuntimeBadge runtime={project.runtime} />
                <StatusPill
                  variant={project.status}
                  pulse={project.status === "running" || project.status === "building"}
                >
                  {project.status}
                </StatusPill>
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-text-muted">
                <a
                  href={`http://${project.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline flex items-center gap-1"
                >
                  {project.domain}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {project.status === "running" ? (
              <PDCPButton variant="danger" onClick={() => stopProject(project.id)}>
                <Square className="w-4 h-4" />
                Stop
              </PDCPButton>
            ) : project.status === "stopped" ? (
              <PDCPButton variant="success" onClick={() => startProject(project.id)}>
                <Play className="w-4 h-4" />
                Start
              </PDCPButton>
            ) : (
              <PDCPButton loading disabled>
                Starting...
              </PDCPButton>
            )}
            <PDCPButton variant="secondary" onClick={() => restartProject(project.id)} disabled={project.status === "building"}>
              <RotateCcw className="w-4 h-4" />
              Restart
            </PDCPButton>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-panel-border">
          {([
            { id: "control", label: "Control", icon: Settings },
            { id: "logs", label: "Logs", icon: TerminalIcon },
            { id: "env", label: "Environment", icon: Key },
            { id: "settings", label: "Settings", icon: Settings },
          ] as { id: Tab; label: string; icon: React.ElementType }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative",
                activeTab === tab.id
                  ? "text-accent-primary"
                  : "text-text-muted hover:text-text-primary"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary"
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "control" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Stats */}
              <PanelCard padding="lg">
                <PanelCardHeader>
                  <PanelCardTitle>Resource Usage</PanelCardTitle>
                </PanelCardHeader>
                <PanelCardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted">CPU</span>
                    <span className="text-text-primary font-medium">{project.cpu || 0}%</span>
                  </div>
                  <div className="h-2 bg-panel-border rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-accent-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${project.cpu || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted">Memory</span>
                    <span className="text-text-primary font-medium">{project.memory || 0}MB</span>
                  </div>
                  <div className="h-2 bg-panel-border rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-status-building"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(((project.memory || 0) / 1024) * 100, 100)}%` }}
                    />
                  </div>
                </PanelCardContent>
              </PanelCard>

              {/* Info */}
              <PanelCard padding="lg">
                <PanelCardHeader>
                  <PanelCardTitle>Details</PanelCardTitle>
                </PanelCardHeader>
                <PanelCardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Created</span>
                    <span className="text-text-primary">{project.createdAt.toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Last deployed</span>
                    <span className="text-text-primary">{project.lastDeployed.toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Runtime</span>
                    <RuntimeBadge runtime={project.runtime} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Internal port</span>
                    <span className="text-text-primary">{project.port}</span>
                  </div>
                </PanelCardContent>
              </PanelCard>
            </div>
          )}

          {activeTab === "logs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isConnected && (
                    <>
                      <div className="w-2 h-2 rounded-full bg-status-running animate-pulse" />
                      <span className="text-sm text-text-muted">Live</span>
                    </>
                  )}
                  {!isConnected && <span className="text-sm text-text-muted">Connecting...</span>}
                </div>
                <PDCPButton variant="secondary" size="sm" onClick={clearLogs}>
                  Clear
                </PDCPButton>
              </div>
              <Terminal logs={logs} maxHeight="500px" streaming={isConnected} />
            </div>
          )}

          {activeTab === "env" && (
            <PanelCard padding="lg">
              <PanelCardHeader>
                <PanelCardTitle>Environment Variables</PanelCardTitle>
                <PDCPButton variant="secondary" size="sm">
                  Add Variable
                </PDCPButton>
              </PanelCardHeader>
              <PanelCardContent className="space-y-2">
                {envLoading ? <Skeleton className="h-20" /> : (
                  envVars?.map((env) => (
                    <EnvRow
                      key={env.name}
                      name={env.name}
                      value={env.value}
                      masked
                      onEdit={() => { }}
                      onDelete={() => { }}
                    />
                  )))}
                {envVars?.length === 0 && <p className="text-sm text-text-muted">No environment variables set.</p>}
              </PanelCardContent>
            </PanelCard>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6">
              <PanelCard padding="lg">
                <PanelCardHeader>
                  <PanelCardTitle>General Settings</PanelCardTitle>
                </PanelCardHeader>
                <PanelCardContent className="space-y-4">
                  <p className="text-text-muted text-sm">
                    Project settings will appear here.
                  </p>
                </PanelCardContent>
              </PanelCard>

              {/* Danger zone */}
              <PanelCard padding="lg" className="border-status-error/30">
                <PanelCardHeader>
                  <PanelCardTitle className="text-status-error">Danger Zone</PanelCardTitle>
                </PanelCardHeader>
                <PanelCardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text-primary">Delete Project</p>
                      <p className="text-sm text-text-muted">
                        Permanently delete this project and all its data
                      </p>
                    </div>
                    <PDCPButton variant="danger" onClick={() => setShowDeleteDialog(true)}>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </PDCPButton>
                  </div>
                </PanelCardContent>
              </PanelCard>
            </div>
          )}
        </motion.div>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title={`Delete ${project.name}?`}
        description="This action cannot be undone. All data will be permanently removed."
        confirmLabel="Delete Project"
        variant="danger"
      />
    </DashboardLayout>
  );
}
