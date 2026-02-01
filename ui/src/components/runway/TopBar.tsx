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
  Wifi,
  WifiOff,
  Lock,
  ShieldAlert,
  X,
  Trash2,
  CheckCheck,
  Folder
} from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { useDomain } from "@/hooks/useDomain";
import { useNotifications, formatNotificationTime } from "@/hooks/useNotifications";
import { useProjects } from "@/hooks/useProjects";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { label: 'Overview', path: '/' },
  { label: 'Projects', path: '/projects' },
  { label: 'Deploy', path: '/deploy' },
  { label: 'Services', path: '/services' },
  { label: 'Settings', path: '/settings' },
];

interface TopBarProps {
  className?: string;
}

export function TopBar({ className }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchFocused, setSearchFocused] = React.useState(false);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const { isConnected } = useWebSocket();
  const { isSecure, isLoading: isDomainLoading } = useDomain();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification, clearAll } = useNotifications();
  const { projects } = useProjects();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Filter projects based on search query
  const filteredProjects = React.useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return projects.filter(
      p => p.name.toLowerCase().includes(query) || p.runtime.toLowerCase().includes(query)
    ).slice(0, 5); // Limit to 5 results
  }, [searchQuery, projects]);

  // Keyboard shortcut for search (Cmd+K / Ctrl+K)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape" && searchFocused) {
        searchInputRef.current?.blur();
        setSearchQuery("");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchFocused]);

  const handleSearchSelect = (projectId: string) => {
    setSearchQuery("");
    setSearchFocused(false);
    navigate(`/projects/${projectId}`);
  };

  const handleNotificationClick = (notificationId: string, projectId?: string) => {
    markAsRead(notificationId);
    if (projectId) {
      setShowNotifications(false);
      navigate(`/projects/${projectId}`);
    }
  };

  return (
    <header className={cn(
      "h-16 bg-surface flex items-center justify-between px-4 lg:px-6",
      className
    )}>
      {/* Logo */}
      <Link to="/" className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent-primary flex items-center justify-center">
          <span className="text-accent-primary-foreground font-bold text-sm">R</span>
        </div>
        <span className="text-text-primary font-semibold hidden sm:block">Runway</span>
      </Link>

      {/* Center Navigation Tabs */}
      <div className="hidden md:flex items-center bg-panel rounded-pill p-1 border border-zinc-200">
        <div className="p-2">
          <div className="grid grid-cols-3 gap-0.5 w-5 h-5">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="bg-zinc-400 rounded-sm" />
            ))}
          </div>
        </div>
        <div className="flex space-x-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path === '/projects' && location.pathname.startsWith('/projects/'));

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'px-4 py-2 rounded-pill text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-neon text-primary-foreground'
                    : 'text-zinc-500 hover:text-zinc-900'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-xs mx-4 relative hidden lg:block">
        <div className="relative flex items-center">
          <Search className="absolute left-4 w-4 h-4 text-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className={cn(
              "w-full h-10 pl-10 pr-16 rounded-[10px] text-sm",
              "bg-[hsl(0_0%_100%/0.05)] border border-[hsl(0_0%_100%/0.08)]",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:border-[hsl(78_100%_61%/0.3)] focus:ring-1 focus:ring-[hsl(78_100%_61%/0.2)]",
              "transition-all duration-175"
            )}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              // Delay blur to allow click on results
              setTimeout(() => setSearchFocused(false), 200);
            }}
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

        {/* Search Results Dropdown */}
        <AnimatePresence>
          {searchFocused && searchQuery.trim() && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full mt-2 w-full bg-panel border border-panel-border rounded-xl shadow-elevated z-50 overflow-hidden"
            >
              {filteredProjects.length > 0 ? (
                <div className="py-1">
                  {filteredProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleSearchSelect(project.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-panel-hover transition-colors text-left"
                    >
                      <Folder className="w-4 h-4 text-text-muted" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{project.name}</p>
                        <p className="text-xs text-text-muted">{project.runtime} • {project.status}</p>
                      </div>
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        project.status === "running" && "bg-status-running",
                        project.status === "stopped" && "bg-zinc-500",
                        project.status === "failed" && "bg-status-error"
                      )} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-text-muted">No projects found</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Security Mode Indicator */}
        {!isDomainLoading && (
          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors",
              isSecure
                ? "bg-green-500/10 border-green-500/20 hover:bg-green-500/20"
                : "bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20"
            )}
            title={isSecure ? "HTTPS enabled" : "HTTP mode - Click to configure domain"}
          >
            {isSecure ? (
              <>
                <Lock className="w-4 h-4 text-green-500" />
                <span className="text-xs text-green-400 hidden sm:inline">HTTPS</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4 text-yellow-500" />
                <span className="text-xs text-yellow-400 hidden sm:inline">HTTP</span>
              </>
            )}
          </Link>
        )}

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
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold bg-accent-primary text-accent-primary-foreground rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
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
                  <div className="p-3 border-b border-panel-border flex items-center justify-between">
                    <h3 className="text-sm font-medium text-text-primary">
                      Notifications {unreadCount > 0 && `(${unreadCount})`}
                    </h3>
                    <div className="flex items-center gap-1">
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-panel-hover rounded transition-colors"
                          title="Mark all as read"
                        >
                          <CheckCheck className="w-4 h-4" />
                        </button>
                      )}
                      {notifications.length > 0 && (
                        <button
                          onClick={clearAll}
                          className="p-1.5 text-text-muted hover:text-status-error hover:bg-panel-hover rounded transition-colors"
                          title="Clear all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.slice(0, 10).map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif.id, notif.projectId)}
                          className={cn(
                            "p-3 hover:bg-panel-hover border-b border-panel-border last:border-0 cursor-pointer transition-colors group",
                            !notif.read && "bg-panel-hover/50"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                              notif.type === "success" && "bg-status-running",
                              notif.type === "error" && "bg-status-error",
                              notif.type === "warning" && "bg-yellow-500",
                              notif.type === "info" && "bg-status-building"
                            )} />
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-sm text-text-primary",
                                !notif.read && "font-medium"
                              )}>{notif.title}</p>
                              <p className="text-xs text-text-muted truncate">{notif.message}</p>
                              <p className="text-2xs text-text-muted mt-1">{formatNotificationTime(notif.time)}</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                clearNotification(notif.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-status-error transition-all"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-8 text-center">
                        <Bell className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
                        <p className="text-sm text-text-muted">No notifications</p>
                        <p className="text-xs text-text-muted mt-1">
                          You'll see alerts here when CPU or memory usage is high
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

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
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-status-error hover:bg-panel-hover rounded-lg transition-colors"
                    >
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
