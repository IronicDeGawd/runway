import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { 
  Search, 
  Bell, 
  Settings, 
  User, 
  ChevronDown,
  LogOut,
  HelpCircle,
  Wifi,
  WifiOff
} from "lucide-react";
import { Link } from "react-router-dom";
import { useWebSocket } from "@/contexts/WebSocketContext";

interface TopBarProps {
  className?: string;
}

export function TopBar({ className }: TopBarProps) {
  const [searchFocused, setSearchFocused] = React.useState(false);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const { isConnected } = useWebSocket();

  const notifications = [
    { id: 1, title: "Deploy successful", message: "api-gateway deployed to production", time: "2m ago", type: "success" },
    { id: 2, title: "Build failed", message: "frontend-app build failed", time: "15m ago", type: "error" },
    { id: 3, title: "New version available", message: "Runway v2.1.0 is ready", time: "1h ago", type: "info" },
  ];

  return (
    <header className={cn(
      "h-14 bg-surface border-b border-panel-border flex items-center justify-between px-4 lg:px-6",
      className
    )}>
      {/* Logo */}
      <Link to="/" className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent-primary flex items-center justify-center">
          <span className="text-accent-primary-foreground font-bold text-sm">P</span>
        </div>
        <span className="text-text-primary font-semibold hidden sm:block">Runway</span>
      </Link>

      {/* Search */}
      <div className="flex-1 max-w-md mx-4 lg:mx-8">
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search projects, services..."
            className={cn(
              "w-full h-10 pl-10 pr-16 rounded-[10px] text-sm",
              "bg-[hsl(0_0%_100%/0.05)] border border-[hsl(0_0%_100%/0.08)]",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:border-[hsl(78_100%_61%/0.3)] focus:ring-1 focus:ring-[hsl(78_100%_61%/0.2)]",
              "transition-all duration-175"
            )}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <div className="absolute right-3 flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 text-[11px] font-medium text-text-secondary bg-[hsl(0_0%_100%/0.1)] border border-[hsl(0_0%_100%/0.15)] rounded">
              ⌘
            </kbd>
            <kbd className="px-1.5 py-0.5 text-[11px] font-medium text-text-secondary bg-[hsl(0_0%_100%/0.1)] border border-[hsl(0_0%_100%/0.15)] rounded">
              K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* WebSocket Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-panel border border-panel-border">
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4 text-status-running" />
              <span className="text-xs text-text-muted hidden sm:inline">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-status-error" />
              <span className="text-xs text-text-muted hidden sm:inline">Disconnected</span>
            </>
          )}
        </div>
        
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={cn(
              "relative p-2 rounded-lg transition-colors",
              showNotifications ? "bg-panel-active text-text-primary" : "text-text-muted hover:bg-panel hover:text-text-primary"
            )}
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent-primary rounded-full" />
          </button>
          
          <AnimatePresence>
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-panel border border-panel-border rounded-xl shadow-elevated z-50 overflow-hidden"
                >
                  <div className="p-3 border-b border-panel-border">
                    <h3 className="text-sm font-medium text-text-primary">Notifications</h3>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.map((notif) => (
                      <div key={notif.id} className="p-3 hover:bg-panel-hover border-b border-panel-border last:border-0 cursor-pointer transition-colors">
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                            notif.type === "success" && "bg-status-running",
                            notif.type === "error" && "bg-status-error",
                            notif.type === "info" && "bg-status-building"
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary">{notif.title}</p>
                            <p className="text-xs text-text-muted truncate">{notif.message}</p>
                            <p className="text-2xs text-text-muted mt-1">{notif.time}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-2 border-t border-panel-border">
                    <button className="w-full text-center text-xs text-accent-primary hover:underline py-1">
                      View all notifications
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Help */}
        <button className="p-2 rounded-lg text-text-muted hover:bg-panel hover:text-text-primary transition-colors">
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={cn(
              "flex items-center gap-2 p-1.5 pr-3 rounded-lg transition-colors",
              showUserMenu ? "bg-panel-active" : "hover:bg-panel"
            )}
          >
            <div className="w-7 h-7 rounded-full bg-accent-primary/20 flex items-center justify-center">
              <User className="w-4 h-4 text-accent-primary" />
            </div>
            <ChevronDown className={cn(
              "w-4 h-4 text-text-muted transition-transform",
              showUserMenu && "rotate-180"
            )} />
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-panel border border-panel-border rounded-xl shadow-elevated z-50 overflow-hidden"
                >
                  <div className="p-3 border-b border-panel-border">
                    <p className="text-sm font-medium text-text-primary">Admin</p>
                    <p className="text-xs text-text-muted">admin@runway.local</p>
                  </div>
                  <div className="p-1">
                    <Link
                      to="/settings"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-panel-hover rounded-lg transition-colors"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                    <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-status-error hover:bg-panel-hover rounded-lg transition-colors">
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
