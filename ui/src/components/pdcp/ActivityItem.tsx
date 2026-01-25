import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Rocket, Play, Square, AlertTriangle, Settings } from "lucide-react";
import type { ActivityItem as Activity } from "@/hooks/useActivity";

interface ActivityItemProps {
  activity: Activity;
  index?: number;
  formatTime: (date: Date) => string;
}

const activityConfig = {
  deploy: {
    icon: Rocket,
    color: "text-accent-primary",
    borderColor: "border-l-accent-primary",
  },
  start: {
    icon: Play,
    color: "text-status-running",
    borderColor: "border-l-status-running",
  },
  stop: {
    icon: Square,
    color: "text-status-stopped",
    borderColor: "border-l-status-stopped",
  },
  error: {
    icon: AlertTriangle,
    color: "text-status-error",
    borderColor: "border-l-status-error",
  },
  config: {
    icon: Settings,
    color: "text-text-muted",
    borderColor: "border-l-text-muted",
  },
};

export function ActivityItem({ activity, index = 0, formatTime }: ActivityItemProps) {
  const config = activityConfig[activity.type];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: "easeOut" }}
      className={cn(
        "relative flex items-start gap-3 p-3 rounded-lg",
        "bg-[hsl(var(--activity-bg))] hover:bg-[hsl(var(--activity-bg-hover))]",
        "border-l-[3px] transition-colors duration-200",
        config.borderColor
      )}
    >
      {/* Icon */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-panel flex items-center justify-center mt-0.5">
        <Icon className={cn("w-3 h-3", config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-sm text-text-primary truncate">
            {activity.project}
          </span>
          <span className="flex-shrink-0 text-[11px] text-text-muted tabular-nums">
            {formatTime(activity.timestamp)}
          </span>
        </div>
        <p className="text-xs text-text-secondary truncate mt-0.5">
          {activity.message}
        </p>
      </div>
    </motion.div>
  );
}
