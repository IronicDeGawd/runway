import * as React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Server,
  ArrowLeft,
  Filter,
  FilePlus,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useProjects } from "@/hooks/useProjects";
import { useActivity, formatTimeAgo } from "@/hooks/useActivity";
import { cn } from "@/lib/utils";
import { useServices } from "@/hooks/useServices";

export default function OverviewPage() {
  const { metrics, history, isLoading: metricsLoading } = useSystemMetrics();
  const { projects, isLoading: projectsLoading, startProject, stopProject, restartProject } = useProjects();
  const { activity, isLoading: activityLoading } = useActivity();
  const { services } = useServices();

  const runningProjects = projects.filter((p) => p.status === "running").length;
  const stoppedProjects = projects.filter((p) => p.status === "stopped").length;
  const buildingProjects = projects.filter((p) => p.status === "building").length;

  return (
    <DashboardLayout>
      <div className="px-8 pb-6 pt-2 space-y-6 animate-fade-in">
        {/* Header - Matches Project Hub style */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button className="p-2 rounded-pill bg-zinc-900 border border-zinc-800 hover:bg-surface-overlay">
              <ArrowLeft className="w-5 h-5 text-zinc-400" />
            </button>
            <h1 className="text-4xl font-light text-foreground">System Overview</h1>
          </div>
          <div className="flex items-center space-x-3">
            <button className="p-3 rounded-pill bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-foreground">
              <Filter className="w-5 h-5" />
            </button>
            <Link to="/deploy">
              <button className="flex items-center space-x-2 px-5 py-3 rounded-pill border border-zinc-700 text-foreground bg-transparent hover:bg-surface-elevated">
                <FilePlus className="w-5 h-5" />
                <span>Create project</span>
              </button>
            </Link>
          </div>
        </div>

        {/* Stats Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: System Health */}
          <motion.div
            className="bg-surface-elevated rounded-card p-card border border-zinc-800"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Container 1: Header */}
            <div className="bg-surface-muted rounded-inner p-4 border border-zinc-800 mb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">System Health</h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-pill bg-neon animate-pulse" />
                    <span className="text-sm text-zinc-400">Operational</span>
                  </div>
                  <span className="text-zinc-600">|</span>
                  <span className="text-sm text-foreground">
                    Score: <span className="text-neon font-semibold">{metricsLoading ? '--' : Math.round(100 - (metrics.cpu * 0.4 + metrics.memory * 0.35 + metrics.disk * 0.25))}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Container 2: Content */}
            <div className="bg-surface-muted rounded-inner p-4 border border-zinc-800">
              <div className="flex gap-4">
                {/* Left: Stacked Metrics */}
                <div className="w-1/3 space-y-3">
                  <div className="bg-zinc-900/50 rounded-element p-4 border border-zinc-700">
                    <p className="text-xs text-zinc-400">Uptime</p>
                    <p className="text-xl text-foreground mt-1">
                      {metricsLoading ? '--' : `${Math.floor(metrics.uptime / 3600)}h`}
                    </p>
                  </div>
                  <div className="bg-zinc-900/50 rounded-element p-4 border border-zinc-700">
                    <p className="text-xs text-zinc-400">Projects</p>
                    <p className="text-xl text-foreground mt-1">{projects.length}</p>
                  </div>
                </div>

                {/* Right: Activity Graph */}
                <div className="w-2/3 bg-zinc-900/50 rounded-element p-4 border border-zinc-700">
                  <p className="text-xs text-zinc-400 mb-3">Activity</p>
                  <div className="flex items-end justify-between gap-1 h-20">
                    {(history.length > 0 ? history.slice(-12) : [35, 52, 48, 70, 45, 80, 65, 55, 90, 75, 60, 85]).map((value, i) => (
                      <motion.div
                        key={i}
                        className="flex-1 bg-neon/80 rounded-sm transition-all hover:bg-neon cursor-pointer"
                        initial={{ height: 0 }}
                        animate={{ height: `${value}%` }}
                        transition={{ duration: 0.3, delay: i * 0.05 }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-zinc-500">12h ago</span>
                    <span className="text-[10px] text-zinc-500">Now</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Resource Overview */}
          <motion.div
            className="bg-surface-elevated rounded-card p-8 border border-zinc-800 relative"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-zinc-500 text-sm mb-1">Available Resources</p>
                <div className="flex items-baseline space-x-2">
                  <p className="text-4xl font-normal text-foreground">
                    {metricsLoading ? '--' : Math.max(0, 100 - metrics.cpu)}%
                  </p>
                  <span className="text-zinc-500 text-sm">free capacity</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-pill bg-neon animate-pulse" />
                <span className="text-sm text-neon">All systems operational</span>
              </div>
            </div>

            <div className="flex items-end space-x-4">
              <div className="flex-1 h-32 bg-surface-muted rounded-inner p-4 flex flex-col justify-end border border-zinc-800 cursor-pointer hover:border-zinc-600 transition-colors">
                <p className="text-xs text-zinc-400">CPU</p>
                <p className="text-zinc-400 mt-1">{metricsLoading ? '--' : metrics.cpu}%</p>
              </div>
              <motion.div
                className="flex-1 h-40 bg-neon rounded-inner p-4 flex flex-col justify-end transform -translate-y-2 cursor-pointer"
                whileHover={{ scale: 1.02 }}
              >
                <p className="text-xs text-primary-foreground/60 font-bold">Memory</p>
                <p className="text-primary-foreground font-bold mt-1">
                  {metricsLoading ? '--' : `${(metrics.usedMemory / (1024 ** 3)).toFixed(1)}GB`}
                </p>
              </motion.div>
              <div className="flex-1 h-32 bg-surface-muted rounded-inner p-4 flex flex-col justify-end border border-zinc-800 cursor-pointer hover:border-zinc-600 transition-colors">
                <p className="text-xs text-zinc-400">Disk</p>
                <p className="text-zinc-400 mt-1">{metricsLoading ? '--' : metrics.disk}%</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Unified Two Column Layout - White Panel */}
        <motion.div
          className="bg-panel rounded-panel p-2 flex flex-col md:flex-row min-h-[400px]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {/* Left - Project Status */}
          <div className="w-full md:w-5/12 p-card border-b md:border-b-0 md:border-r border-zinc-100">
            <h2 className="text-lg font-semibold text-panel-foreground mb-6">Project Status</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-4 rounded-inner bg-zinc-50 border border-zinc-200">
                <span className="text-sm text-status-success font-medium">Running</span>
                <span className="text-xl font-light text-zinc-900">{runningProjects}</span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-inner bg-zinc-50 border border-zinc-200">
                <span className="text-sm text-status-error font-medium">Stopped</span>
                <span className="text-xl font-light text-zinc-900">{stoppedProjects}</span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-inner bg-zinc-50 border border-zinc-200">
                <span className="text-sm text-status-warning font-medium">Building</span>
                <span className="text-xl font-light text-zinc-900">{buildingProjects}</span>
              </div>
            </div>

            {/* Services Section */}
            <div className="mt-4 pt-4 border-t border-zinc-200">
              <h3 className="text-sm font-medium text-zinc-500 mb-3">Services</h3>
              <div className="space-y-2">
                {services.map((service) => (
                  <div key={service.id} className="flex items-center justify-between py-2 px-3 rounded-element bg-zinc-50 border border-zinc-200">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-zinc-400" />
                      <span className="text-sm text-zinc-700 capitalize">{service.type}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={cn(
                        "h-2 w-2 rounded-pill",
                        service.status === "running" ? "bg-status-running" : "bg-status-stopped"
                      )} />
                      <span className="text-xs text-zinc-500 capitalize">{service.status}</span>
                    </div>
                  </div>
                ))}
                {services.length === 0 && (
                  <div className="text-sm text-zinc-400 italic">No services configured</div>
                )}
              </div>
            </div>
          </div>

          {/* Right - Activity Feed (dark) */}
          <div className="w-full md:w-7/12 p-4">
            <div className="bg-zinc-900 rounded-panel h-full p-card border border-zinc-800">
              <h2 className="text-lg font-semibold text-foreground mb-6">Recent Activity</h2>
              <div className="space-y-3">
                {activityLoading ? (
                  <div className="text-zinc-400 text-sm">Loading activity...</div>
                ) : (
                  activity.slice(0, 5).map((item) => (
                    <motion.div
                      key={item.id}
                      className="flex items-start gap-3 p-3 rounded-element bg-surface-muted hover:bg-surface-overlay transition-colors border border-zinc-800 cursor-pointer"
                      whileHover={{ scale: 1.01 }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-foreground truncate">
                            {item.project || 'System'}
                          </span>
                          <span className={cn(
                            'inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-xs',
                            item.type === 'deploy' || item.type === 'start' ? 'bg-status-running/20 text-status-running' :
                              item.type === 'stop' ? 'bg-zinc-700 text-zinc-300' :
                                'bg-status-building/20 text-status-building'
                          )}>
                            <span className="h-1.5 w-1.5 rounded-pill bg-current" />
                            {item.type}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400 truncate">{item.message}</p>
                      </div>
                      <span className="text-xs text-zinc-500 whitespace-nowrap">
                        {formatTimeAgo(item.timestamp)}
                      </span>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
