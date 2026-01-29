import * as React from "react";
import { motion } from "framer-motion";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Rocket,
  Server,
  Settings,
  Search,
  Bell,
  HelpCircle,
} from "lucide-react";

interface TopNavigationProps {
  className?: string;
}

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Overview", end: true },
  { path: "/projects", icon: FolderKanban, label: "Projects", end: false },
  { path: "/deploy", icon: Rocket, label: "Deploy", end: false },
  { path: "/services", icon: Server, label: "Services", end: false },
  { path: "/settings", icon: Settings, label: "Settings", end: false },
];

export function TopNavigation({ className }: TopNavigationProps) {
  const location = useLocation();
  const [searchFocused, setSearchFocused] = React.useState(false);

  return (
    <header
      className={cn(
        "h-16 bg-surface/80 backdrop-blur-md border-b border-panel-border",
        "flex items-center justify-between px-6",
        "sticky top-0 z-50",
        className
      )}
    >
      {/* Logo - Left */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-accent-primary flex items-center justify-center shadow-glow-accent">
          <span className="text-accent-primary-foreground font-bold text-sm">P</span>
        </div>
        <span className="font-semibold text-text-primary text-lg tracking-tight">
          Runway
        </span>
      </div>

      {/* Pill Navigation - Center */}
      <nav className="flex items-center">
        <div className="flex items-center gap-1 bg-surface-overlay rounded-full p-1.5">
          {navItems.map((item) => {
            const isActive = item.end
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path) && 
                (item.path !== "/" || location.pathname === "/");
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className="relative"
              >
                <motion.div
                  className={cn(
                    "px-5 py-2 rounded-full text-sm font-medium transition-colors",
                    "flex items-center gap-2",
                    isActive
                      ? "bg-accent-primary text-accent-primary-foreground"
                      : "text-text-muted hover:text-text-primary hover:bg-white/5"
                  )}
                  whileHover={!isActive ? { scale: 1.02 } : {}}
                  whileTap={{ scale: 0.98 }}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </motion.div>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Right Section: Search + Actions */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Pill Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            className={cn(
              "w-48 h-10 pl-10 pr-14 rounded-full text-sm",
              "bg-black/30 border border-white/10",
              "text-text-primary placeholder:text-text-muted",
              "transition-all duration-200",
              "focus:outline-none focus:border-accent-primary/40 focus:ring-2 focus:ring-accent-primary/20",
              "focus:w-64"
            )}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd className={cn(
            "absolute right-3 top-1/2 -translate-y-1/2",
            "px-2 py-0.5 rounded text-[10px] font-medium",
            "bg-white/5 text-text-muted border border-white/10",
            "transition-opacity",
            searchFocused && "opacity-0"
          )}>
            ⌘K
          </kbd>
        </div>

        {/* Action Buttons */}
        <motion.button
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Bell className="w-4 h-4" />
        </motion.button>

        <motion.button
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <HelpCircle className="w-4 h-4" />
        </motion.button>

        {/* User Avatar */}
        <motion.button
          className="w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center text-accent-primary font-medium text-sm border border-accent-primary/30"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          A
        </motion.button>
      </div>
    </header>
  );
}