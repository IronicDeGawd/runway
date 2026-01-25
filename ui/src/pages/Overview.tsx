import * as React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { 
  Cpu, 
  HardDrive, 
  MemoryStick, 
  ArrowUpRight,
  Rocket,
  Clock,
  TrendingUp,
} from "lucide-react";
import { DashboardLayout } from "@/components/pdcp/DashboardLayout";
import { PanelCard, PanelCardHeader, PanelCardTitle, PanelCardContent } from "@/components/pdcp/PanelCard";
import { CutoutPanel, CutoutPanelHeader, CutoutPanelTitle } from "@/components/pdcp/CutoutPanel";
import { HeroStatCard } from "@/components/pdcp/HeroStatCard";
import { MiniChart } from "@/components/pdcp/StatWidget";
import { StatusPill } from "@/components/pdcp/StatusPill";
import { ProjectRow } from "@/components/pdcp/ProjectRow";
import { ActivityItem } from "@/components/pdcp/ActivityItem";
import { PDCPButton } from "@/components/pdcp/PDCPButton";
import { Skeleton } from "@/components/pdcp/ProgressElements";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useProjects } from "@/hooks/useProjects";
import { useActivity, formatTimeAgo } from "@/hooks/useActivity";
import { cn } from "@/lib/utils";

// Hero metric card for secondary stats - MUCH larger numbers
function HeroMetric({ 
  label, 
  value, 
  suffix, 
  icon: Icon, 
  chart,
  delay = 0 
}: { 
  label: string; 
  value: number; 
  suffix?: string; 
  icon: React.ElementType;
  chart?: number[];
  delay?: number;
}) {
  const [displayValue, setDisplayValue] = React.useState(0);

  React.useEffect(() => {
    const duration = 800;
    const steps = 40;
    const stepDuration = duration / steps;
    const increment = value / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.round(increment * currentStep));
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <motion.div
      className="relative bg-panel rounded-3xl p-5 min-h-[120px] shadow-card border border-panel-border"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
    >
      {/* Icon positioned top-right */}
      <Icon className="absolute top-4 right-4 w-4 h-4 text-text-muted opacity-30" />
      
      <div className="flex flex-col h-full justify-between">
        <span className="text-[10px] font-medium text-text-muted uppercase tracking-widest">
          {label}
        </span>
        <div className="flex items-end justify-between mt-auto">
          <div className="flex items-baseline gap-1">
            <span className="text-[36px] font-bold text-text-primary tabular-nums leading-none">
              {displayValue}
            </span>
            {suffix && (
              <span className="text-sm text-text-muted font-medium">{suffix}</span>
            )}
          </div>
          {chart && chart.length > 0 && (
            <div className="w-16 h-8">
              <MiniChart data={chart} />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function OverviewPage() {
  const { metrics, history, isLoading: metricsLoading } = useSystemMetrics();
  const { projects, isLoading: projectsLoading, startProject, stopProject, restartProject } = useProjects();
  const { activity, isLoading: activityLoading } = useActivity();

  const runningProjects = projects.filter((p) => p.status === "running").length;
  const stoppedProjects = projects.filter((p) => p.status === "stopped").length;
  const buildingProjects = projects.filter((p) => p.status === "building").length;

  // Calculate overall health based on metrics
  const overallHealth = React.useMemo(() => {
    if (metricsLoading) return 0;
    const cpuHealth = Math.max(0, 100 - metrics.cpu);
    const memoryHealth = Math.max(0, 100 - metrics.memory);
    const diskHealth = Math.max(0, 100 - metrics.disk);
    return (cpuHealth * 0.4 + memoryHealth * 0.35 + diskHealth * 0.25);
  }, [metrics, metricsLoading]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div 
          className="flex items-center justify-between"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div>
            <h1 className="text-3xl font-bold text-text-primary tracking-tight">Overview</h1>
            <p className="text-text-muted text-sm mt-1">Real-time system status and activity</p>
          </div>
          <Link to="/deploy">
            <PDCPButton 
              icon={<Rocket className="w-4 h-4" />}
              className="shadow-glow-accent text-base px-6 py-3 h-12"
            >
              New Deploy
            </PDCPButton>
          </Link>
        </motion.div>

        {/* Hero Stats Section - Asymmetric Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Hero Card - 60% width (3 cols) */}
          <div className="lg:col-span-3">
            {metricsLoading ? (
              <Skeleton className="h-[180px] rounded-3xl" />
            ) : (
              <HeroStatCard
                value={overallHealth}
                label="System Health"
                sublabel="All services responding within normal parameters"
                secondaryStats={[
                  { label: "Uptime", value: metrics.uptime, suffix: "%" },
                  { label: "Requests/min", value: "2.4k", suffix: "" },
                  { label: "Avg Response", value: "124", suffix: "ms" },
                ]}
              />
            )}
          </div>

          {/* Secondary Stats - 40% width (2 cols) */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-3">
            {metricsLoading ? (
              <>
                <Skeleton className="h-[120px] rounded-3xl" />
                <Skeleton className="h-[120px] rounded-3xl" />
                <Skeleton className="h-[120px] rounded-3xl col-span-2" />
              </>
            ) : (
              <>
                <HeroMetric
                  label="CPU"
                  value={Math.round(metrics.cpu)}
                  suffix="%"
                  icon={Cpu}
                  chart={history.slice(-12)}
                  delay={0.1}
                />
                <HeroMetric
                  label="Memory"
                  value={Math.round(metrics.memory)}
                  suffix="%"
                  icon={MemoryStick}
                  delay={0.15}
                />
                <motion.div
                  className="col-span-2 relative bg-panel rounded-3xl p-5 shadow-card border border-panel-border"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <HardDrive className="absolute top-4 right-4 w-4 h-4 text-text-muted opacity-30" />
                  <span className="text-[10px] font-medium text-text-muted uppercase tracking-widest">
                    Disk Usage
                  </span>
                  <div className="flex items-center justify-between mt-3 mb-3">
                    <span className="text-[36px] font-bold text-text-primary tabular-nums leading-none">
                      {Math.round(metrics.disk)}%
                    </span>
                    <span className="text-xs text-text-muted">of 100GB</span>
                  </div>
                  <div className="h-2 bg-surface rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-accent-primary rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${metrics.disk}%` }}
                      transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                    />
                  </div>
                </motion.div>
              </>
            )}
          </div>
        </div>

        {/* Main content grid - using Cutout panels for contrast */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Projects List - Light Cutout Panel (3 cols) - THE KEY CHANGE */}
          <div className="lg:col-span-3">
            <CutoutPanel variant="light" padding="lg" animate delay={0.2}>
              <CutoutPanelHeader>
                <div className="flex items-center gap-3">
                  <CutoutPanelTitle>Projects</CutoutPanelTitle>
                  {/* Mini status indicators */}
                  <div className="flex items-center gap-2">
                    {runningProjects > 0 && (
                      <StatusPill variant="running" size="sm" pulse glow>
                        {runningProjects}
                      </StatusPill>
                    )}
                    {buildingProjects > 0 && (
                      <StatusPill variant="building" size="sm" pulse>
                        {buildingProjects}
                      </StatusPill>
                    )}
                    {stoppedProjects > 0 && (
                      <StatusPill variant="stopped" size="sm">
                        {stoppedProjects}
                      </StatusPill>
                    )}
                  </div>
                </div>
                <Link to="/projects" className="text-xs text-accent-primary hover:underline flex items-center gap-1 group">
                  View all
                  <ArrowUpRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </CutoutPanelHeader>
              
              {/* Projects list */}
              {projectsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-2xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {projects.slice(0, 5).map((project, index) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      index={index}
                      onStart={startProject}
                      onStop={stopProject}
                      onRestart={restartProject}
                    />
                  ))}
                </div>
              )}
            </CutoutPanel>
          </div>

          {/* Activity feed - Dark Panel (2 cols) */}
          <div className="lg:col-span-2">
            <PanelCard padding="lg" className="h-full rounded-3xl">
              <PanelCardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-text-muted" />
                  <PanelCardTitle>Activity</PanelCardTitle>
                </div>
              </PanelCardHeader>
              <PanelCardContent>
                <div className="space-y-2">
                  {activityLoading ? (
                    <>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-14 rounded-xl" />
                      ))}
                    </>
                  ) : (
                    activity.slice(0, 6).map((item, index) => (
                      <ActivityItem 
                        key={item.id} 
                        activity={item} 
                        index={index}
                        formatTime={formatTimeAgo}
                      />
                    ))
                  )}
                </div>
              </PanelCardContent>
            </PanelCard>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
