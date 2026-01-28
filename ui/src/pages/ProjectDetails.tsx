import * as React from "react";
import { motion } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Play,
  Square,
  RotateCcw,
  Trash2,
  ExternalLink,
  Activity,
  Settings,
  Terminal as TerminalIcon,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useProjects } from "@/hooks/useProjects";
import { useActivity, formatTimeAgo } from "@/hooks/useActivity";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function ProjectDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { projects, startProject, stopProject, restartProject, deleteProject } = useProjects();
  const { activity } = useActivity();
  const [activeTab, setActiveTab] = React.useState("overview");
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const project = projects.find((p) => p.id === id);
  const projectActivity = activity.filter((a) => a.project === project?.name).slice(0, 10);

  if (!project) {
    return (
      <DashboardLayout>
        <div className="px-8 py-16 text-center">
          <p className="text-xl text-zinc-400">Project not found</p>
          <button
            onClick={() => navigate("/projects")}
            className="mt-4 px-6 py-3 rounded-pill bg-neon text-primary-foreground hover:bg-neon/90"
          >
            Back to Projects
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const handleDelete = () => {
    deleteProject(project.id);
    navigate("/projects");
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "activity", label: "Activity" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <DashboardLayout>
      <div className="px-8 pb-6 pt-2 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => navigate("/projects")}
              className="p-2 rounded-pill bg-zinc-900 border border-zinc-800 hover:bg-surface-overlay"
            >
              <ArrowLeft className="w-5 h-5 text-zinc-400" />
            </button>
            <div>
              <h1 className="text-4xl font-light text-foreground">{project.name}</h1>
              <div className="flex items-center gap-3 mt-2">
                <div className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-medium",
                  project.status === "running" ? "bg-green-900/30 text-green-400" :
                  project.status === "stopped" ? "bg-zinc-800 text-zinc-400" :
                  "bg-yellow-900/30 text-yellow-400"
                )}>
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-pill",
                    project.status === "running" && "bg-green-500 animate-pulse",
                    project.status === "stopped" && "bg-zinc-400",
                    project.status === "building" && "bg-yellow-500 animate-pulse"
                  )} />
                  {project.status}
                </div>
                <span className="text-zinc-600">|</span>
                <span className="text-sm text-zinc-400">{project.runtime}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {project.status === "running" ? (
              <button
                onClick={() => stopProject(project.id)}
                className="flex items-center gap-2 px-5 py-3 rounded-pill border border-zinc-700 text-zinc-300 hover:text-foreground hover:bg-surface-elevated"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            ) : (
              <button
                onClick={() => startProject(project.id)}
                className="flex items-center gap-2 px-5 py-3 rounded-pill bg-neon text-primary-foreground hover:bg-neon/90"
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            )}
            <button
              onClick={() => restartProject(project.id)}
              className="p-3 rounded-pill bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-foreground"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="p-3 rounded-pill bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-5 py-2 rounded-pill text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-neon text-primary-foreground"
                  : "bg-surface-elevated text-zinc-400 hover:text-foreground border border-zinc-800"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Info Card - White Panel */}
              <div className="bg-panel rounded-panel p-6">
                <h2 className="text-xl font-semibold text-panel-foreground mb-4">Project Information</h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-zinc-50 rounded-element border border-zinc-200">
                    <span className="text-sm text-zinc-600">Domain</span>
                    <a
                      href={`http://${project.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-zinc-700 hover:text-panel-foreground flex items-center gap-1"
                    >
                      {project.domain}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex justify-between p-3 bg-zinc-50 rounded-element border border-zinc-200">
                    <span className="text-sm text-zinc-600">Port</span>
                    <span className="text-sm font-medium text-panel-foreground">{project.port}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-zinc-50 rounded-element border border-zinc-200">
                    <span className="text-sm text-zinc-600">Runtime</span>
                    <span className="text-sm font-medium text-panel-foreground">{project.runtime}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-zinc-50 rounded-element border border-zinc-200">
                    <span className="text-sm text-zinc-600">Memory</span>
                    <span className="text-sm font-medium text-panel-foreground">{project.memory}MB</span>
                  </div>
                  {project.status === "running" && (
                    <div className="flex justify-between p-3 bg-zinc-50 rounded-element border border-zinc-200">
                      <span className="text-sm text-zinc-600">CPU Usage</span>
                      <span className="text-sm font-medium text-panel-foreground">{project.cpu}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Metrics Card - Dark */}
              <div className="bg-surface-elevated rounded-card p-6 border border-zinc-800">
                <h2 className="text-xl font-semibold text-foreground mb-4">Performance Metrics</h2>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-zinc-400">CPU</span>
                      <span className="text-foreground">{project.status === "running" ? project.cpu : 0}%</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-pill overflow-hidden">
                      <motion.div
                        className="h-full bg-neon"
                        initial={{ width: 0 }}
                        animate={{ width: project.status === "running" ? `${project.cpu}%` : 0 }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-zinc-400">Memory</span>
                      <span className="text-foreground">{project.memory}MB</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-pill overflow-hidden">
                      <motion.div
                        className="h-full bg-blue-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${(project.memory / 512) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-zinc-400">Uptime</span>
                      <span className="text-foreground">{project.status === "running" ? "99.9%" : "0%"}</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-pill overflow-hidden">
                      <motion.div
                        className="h-full bg-green-500"
                        initial={{ width: 0 }}
                        animate={{ width: project.status === "running" ? "99%" : 0 }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "activity" && (
            <div className="bg-surface-elevated rounded-card p-6 border border-zinc-800">
              <h2 className="text-xl font-semibold text-foreground mb-4">Activity Log</h2>
              <div className="space-y-2">
                {projectActivity.length === 0 ? (
                  <p className="text-zinc-400 py-8 text-center">No activity yet</p>
                ) : (
                  projectActivity.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between p-3 bg-surface-muted rounded-element border border-zinc-800"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "px-2 py-0.5 rounded-pill text-xs font-medium",
                            item.type === "deploy" || item.type === "start" ? "bg-green-600/20 text-green-400" :
                            item.type === "stop" ? "bg-zinc-700 text-zinc-300" :
                            "bg-yellow-600/20 text-yellow-400"
                          )}>
                            {item.type}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-300">{item.message}</p>
                      </div>
                      <span className="text-xs text-zinc-500">{formatTimeAgo(item.timestamp)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="bg-surface-elevated rounded-card p-6 border border-zinc-800">
              <h2 className="text-xl font-semibold text-foreground mb-4">Project Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Project Name</label>
                  <input
                    type="text"
                    defaultValue={project.name}
                    className="w-full px-4 py-3 rounded-element bg-zinc-800 border border-zinc-700 text-foreground focus:outline-none focus:border-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Domain</label>
                  <input
                    type="text"
                    defaultValue={project.domain}
                    className="w-full px-4 py-3 rounded-element bg-zinc-800 border border-zinc-700 text-foreground focus:outline-none focus:border-zinc-600"
                  />
                </div>
                <button
                  onClick={() => toast.success("Settings saved!")}
                  className="px-6 py-3 rounded-pill bg-neon text-primary-foreground hover:bg-neon/90"
                >
                  Save Settings
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <motion.div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setShowDeleteDialog(false)}
        >
          <motion.div
            className="bg-panel rounded-panel p-6 max-w-md w-full mx-4"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-panel-foreground mb-2">Delete {project.name}?</h3>
            <p className="text-zinc-600 mb-6">
              This action cannot be undone. The project and all its data will be permanently removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-4 py-2 rounded-pill border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-pill bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </DashboardLayout>
  );
}
