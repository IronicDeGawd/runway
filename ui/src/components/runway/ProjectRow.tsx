import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Play, Square, RotateCw, ExternalLink, MoreVertical } from "lucide-react";
import { StatusPill, RuntimeBadge } from "./StatusPill";
import { Link } from "react-router-dom";
import type { Project } from "@/hooks/useProjects";
import { getProjectUrl } from "@/utils/url";

interface ProjectRowProps {
  project: Project;
  onStart?: (id: string) => void;
  onStop?: (id: string) => void;
  onRestart?: (id: string) => void;
  index?: number;
}

export function ProjectRow({
  project,
  onStart,
  onStop,
  onRestart,
  index = 0,
}: ProjectRowProps) {
  const statusVariant = project.status as "running" | "stopped" | "building" | "warning" | "error";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      whileHover={{ scale: 1.01, y: -2 }}
      className={cn(
        "group relative flex items-center gap-4 px-5 py-4 rounded-2xl",
        "bg-surface/60 border border-white/5",
        "hover:bg-white/5 hover:border-white/10",
        "cursor-pointer transition-all duration-200",
        project.status === "running" && "border-l-2 border-l-status-running",
        project.status === "building" && "border-l-2 border-l-status-building",
        project.status === "error" && "border-l-2 border-l-status-error"
      )}
    >
      {/* Project info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <Link
            to={`/projects/${project.id}`}
            className="text-sm font-medium text-text-primary hover:text-accent-primary transition-colors truncate"
          >
            {project.name}
          </Link>
          <RuntimeBadge runtime={project.runtime} />
        </div>
        <p className="text-[12px] text-text-muted truncate">
          {project.domain}
        </p>
      </div>

      {/* Status */}
      <StatusPill variant={statusVariant} size="md" pulse={project.status === "running"} glow>
        {project.status}
      </StatusPill>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {project.status === "stopped" ? (
          <ActionButton
            icon={Play}
            label="Start"
            onClick={() => onStart?.(project.id)}
            className="text-status-running hover:bg-status-running/10"
          />
        ) : project.status === "running" ? (
          <>
            <ActionButton
              icon={RotateCw}
              label="Restart"
              onClick={() => onRestart?.(project.id)}
              className="text-text-secondary hover:text-accent-primary hover:bg-accent-primary/10"
            />
            <ActionButton
              icon={Square}
              label="Stop"
              onClick={() => onStop?.(project.id)}
              className="text-status-error hover:bg-status-error/10"
            />
          </>
        ) : null}
        <ActionButton
          icon={ExternalLink}
          label="Open"
          onClick={() => window.open(getProjectUrl(project), "_blank")}
          className="text-text-secondary hover:text-text-primary hover:bg-[hsl(0_0%_100%/0.05)]"
        />
        <ActionButton
          icon={MoreVertical}
          label="More"
          className="text-text-muted hover:text-text-primary hover:bg-[hsl(0_0%_100%/0.05)]"
        />
      </div>
    </motion.div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "p-2 rounded-lg transition-colors duration-175",
        className
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
