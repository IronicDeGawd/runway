import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Rocket,
  Server,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Overview", end: true },
  { path: "/projects", icon: FolderKanban, label: "Projects", end: false },
  { path: "/deploy", icon: Rocket, label: "Deploy", end: false },
  { path: "/services", icon: Server, label: "Services", end: false },
  { path: "/settings", icon: Settings, label: "Settings", end: false },
];

const useAggregateStatus = () => {
  return { running: 3, building: 1, errors: 0 };
};

export function Sidebar({ collapsed = false, onToggle, className }: SidebarProps) {
  const location = useLocation();
  const status = useAggregateStatus();

  const getStatusIndicatorColor = () => {
    if (status.errors > 0) return "bg-status-error";
    if (status.building > 0) return "bg-status-building";
    if (status.running > 0) return "bg-status-running";
    return "bg-status-stopped";
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "h-screen flex flex-col bg-sidebar-background border-r border-sidebar-border",
        "flex-shrink-0 overflow-hidden",
        className
      )}
    >
      {/* Logo Section */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
        <motion.div
          className="flex items-center gap-3"
          animate={{ justifyContent: collapsed ? "center" : "flex-start" }}
        >
          <div className="w-8 h-8 rounded-lg bg-accent-primary flex items-center justify-center flex-shrink-0 shadow-glow-accent">
            <span className="text-accent-primary-foreground font-bold text-sm">P</span>
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="font-semibold text-text-primary text-lg tracking-tight overflow-hidden whitespace-nowrap"
              >
                Runway
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Collapse Toggle */}
        <motion.button
          onClick={onToggle}
          className={cn(
            "ml-auto p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-[hsl(0_0%_100%/0.05)] transition-colors",
            collapsed && "ml-0"
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </motion.button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = item.end
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          const showStatusDot = item.path === "/projects" && status.running > 0;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={cn(
                "relative flex items-center h-12 rounded-lg transition-all duration-175",
                "text-text-secondary hover:text-text-primary",
                collapsed ? "justify-center px-3" : "px-4 gap-3",
                isActive && "bg-sidebar-accent text-text-primary font-medium"
              )}
            >
              {/* Active indicator - 4px lime green left border */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-indicator"
                  className="absolute left-0 top-2 bottom-2 w-1 bg-accent-primary rounded-r-full"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}

              <div className="relative flex-shrink-0">
                <Icon className="w-5 h-5" />
                {showStatusDot && (
                  <span
                    className={cn(
                      "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full",
                      getStatusIndicatorColor()
                    )}
                  />
                )}
              </div>

              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm overflow-hidden whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Status Section */}
      <div className="p-4 border-t border-sidebar-border">
        <motion.div
          className={cn(
            "flex items-center",
            collapsed ? "justify-center" : "gap-4"
          )}
          animate={{ justifyContent: collapsed ? "center" : "flex-start" }}
        >
          {/* Status Dots */}
          <div className="flex items-center gap-2">
            <motion.div
              className="w-2.5 h-2.5 rounded-full bg-status-running"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="w-2.5 h-2.5 rounded-full bg-status-building opacity-60" />
            <div className="w-2.5 h-2.5 rounded-full bg-status-stopped opacity-40" />
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col overflow-hidden"
              >
                <span className="text-xs font-medium text-text-primary tabular-nums">
                  {status.running} active
                </span>
                <span className="text-[11px] text-text-muted">
                  {status.building} building
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.aside>
  );
}
