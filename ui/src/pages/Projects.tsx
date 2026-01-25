import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Search,
  Plus,
  Play,
  Square,
  RotateCcw,
  Trash2,
  ExternalLink,
  MoreVertical,
  Filter,
} from "lucide-react";
import { DashboardLayout } from "@/components/pdcp/DashboardLayout";
import { PanelCard } from "@/components/pdcp/PanelCard";
import { CutoutPanel } from "@/components/pdcp/CutoutPanel";
import { StatusPill, RuntimeBadge, FilterChip } from "@/components/pdcp/StatusPill";
import { PDCPButton, IconButton } from "@/components/pdcp/PDCPButton";
import { PDCPInput } from "@/components/pdcp/FormControls";
import { Skeleton } from "@/components/pdcp/ProgressElements";
import { ConfirmDialog } from "@/components/pdcp/Overlays";
import { useProjectsMock, Project } from "@/hooks/useProjectsMock";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "running" | "stopped" | "building";

export default function ProjectsPage() {
  const { projects, isLoading, startProject, stopProject, restartProject, deleteProject } = useProjectsMock();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [deleteTarget, setDeleteTarget] = React.useState<Project | null>(null);

  const filteredProjects = React.useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.domain.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, searchQuery, statusFilter]);

  const statusCounts = React.useMemo(() => ({
    all: projects.length,
    running: projects.filter((p) => p.status === "running").length,
    stopped: projects.filter((p) => p.status === "stopped").length,
    building: projects.filter((p) => p.status === "building").length,
  }), [projects]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Projects</h1>
            <p className="text-text-muted text-sm mt-1">Manage your deployed applications</p>
          </div>
          <Link to="/deploy">
            <PDCPButton icon={<Plus className="w-4 h-4" />}>
              New Project
            </PDCPButton>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 max-w-md">
            <PDCPInput
              placeholder="Search projects..."
              icon={<Search className="w-4 h-4" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
            <Filter className="w-4 h-4 text-text-muted flex-shrink-0" />
            {(["all", "running", "stopped", "building"] as StatusFilter[]).map((status) => (
              <FilterChip
                key={status}
                active={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <span className="ml-1 text-2xs opacity-70">({statusCounts[status]})</span>
              </FilterChip>
            ))}
          </div>
        </div>

        {/* Projects grid - wrapped in CutoutPanel for depth */}
        <CutoutPanel variant="light" padding="lg" animate>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-text-muted">
                <p className="text-lg font-medium">No projects found</p>
                <p className="text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredProjects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <PanelCard
                    hover
                    padding="none"
                    className="overflow-hidden"
                  >
                    {/* Card header */}
                    <div className="p-4 pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Link
                              to={`/projects/${project.id}`}
                              className="font-semibold text-text-primary hover:text-accent-primary transition-colors truncate"
                            >
                              {project.name}
                            </Link>
                            <RuntimeBadge runtime={project.runtime} />
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusPill
                              variant={project.status}
                              pulse={project.status === "running" || project.status === "building"}
                              size="sm"
                            >
                              {project.status}
                            </StatusPill>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card content */}
                    <div className="px-4 pb-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-text-muted">Domain:</span>
                        <a
                          href={`https://${project.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-primary hover:underline truncate flex items-center gap-1"
                        >
                          {project.domain}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-text-muted">
                        <span>Port: {project.port}</span>
                        <span>Memory: {project.memory}MB</span>
                        {project.status === "running" && <span>CPU: {project.cpu}%</span>}
                      </div>
                    </div>

                    {/* Card actions */}
                    <div className="flex items-center justify-between p-3 pt-2 border-t border-panel-border bg-surface/50">
                      <div className="flex gap-1">
                        {project.status === "running" ? (
                          <IconButton
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => stopProject(project.id)}
                            className="text-text-muted hover:text-status-error"
                          >
                            <Square className="w-4 h-4" />
                          </IconButton>
                        ) : project.status === "stopped" ? (
                          <IconButton
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => startProject(project.id)}
                            className="text-text-muted hover:text-status-running"
                          >
                            <Play className="w-4 h-4" />
                          </IconButton>
                        ) : null}
                        <IconButton
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => restartProject(project.id)}
                          disabled={project.status === "building"}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </IconButton>
                      </div>
                      <div className="flex gap-1">
                        <IconButton
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(project)}
                          className="text-text-muted hover:text-status-error"
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                        <Link to={`/projects/${project.id}`}>
                          <IconButton size="icon-sm" variant="ghost">
                            <MoreVertical className="w-4 h-4" />
                          </IconButton>
                        </Link>
                      </div>
                    </div>
                  </PanelCard>
                </motion.div>
              ))}
            </AnimatePresence>
            </div>
          )}
        </CutoutPanel>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteProject(deleteTarget.id)}
        title={`Delete ${deleteTarget?.name}?`}
        description="This action cannot be undone. The project and all its data will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
      />
    </DashboardLayout>
  );
}
