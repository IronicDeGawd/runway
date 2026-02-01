import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressStepperProps {
  steps: { id: string; label: string }[];
  currentStep: number;
  className?: string;
}

export function ProgressStepper({ steps, currentStep, className }: ProgressStepperProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isPending = index > currentStep;

        return (
          <React.Fragment key={step.id}>
            <div className="flex items-center gap-2">
              <motion.div
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors",
                  isCompleted && "border-accent-primary bg-accent-primary text-accent-primary-foreground",
                  isCurrent && "border-accent-primary bg-accent-primary/10 text-accent-primary",
                  isPending && "border-panel-border bg-panel text-text-muted"
                )}
                initial={false}
                animate={{
                  scale: isCurrent ? 1.1 : 1,
                }}
                transition={{ duration: 0.2 }}
              >
                {isCompleted ? (
                  <motion.svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <motion.path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </motion.svg>
                ) : (
                  index + 1
                )}
                {isCurrent && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-accent-primary"
                    initial={{ scale: 1, opacity: 1 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </motion.div>
              <span
                className={cn(
                  "hidden sm:block text-sm font-medium transition-colors",
                  isCompleted && "text-text-primary",
                  isCurrent && "text-accent-primary",
                  isPending && "text-text-muted"
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className="relative flex-1 h-0.5 bg-panel-border min-w-[20px] sm:min-w-[40px]">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-accent-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: isCompleted ? "100%" : "0%" }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Progress bar with animation
interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ProgressBar({ value, max = 100, showLabel = false, size = "md", className }: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const heightClass = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  }[size];

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("w-full bg-panel-border rounded-full overflow-hidden", heightClass)}>
        <motion.div
          className="h-full bg-accent-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1">
          <span className="text-xs text-text-muted">{value}%</span>
          <span className="text-xs text-text-muted">{max}%</span>
        </div>
      )}
    </div>
  );
}

// Loading skeleton
interface SkeletonProps {
  className?: string;
  variant?: "text" | "circle" | "rect";
}

export function Skeleton({ className, variant = "rect" }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-shimmer bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800 bg-[length:200%_100%]",
        variant === "circle" && "rounded-full",
        variant === "text" && "h-4 rounded",
        variant === "rect" && "rounded-md",
        className
      )}
    />
  );
}

// Skeleton variants for common UI patterns
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("bg-surface-elevated rounded-card p-6 border border-zinc-800", className)}>
      <Skeleton className="h-4 w-1/3 mb-4" />
      <Skeleton className="h-8 w-1/2 mb-2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function SkeletonMetric({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-12" />
    </div>
  );
}

export function SkeletonActivityItem({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 p-3 rounded-element bg-surface-muted border border-zinc-800", className)}>
      <Skeleton variant="circle" className="w-8 h-8 flex-shrink-0" />
      <div className="flex-1">
        <Skeleton className="h-4 w-1/3 mb-2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-3 w-12" />
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-1 h-20", className)}>
      {[...Array(12)].map((_, i) => (
        <Skeleton
          key={i}
          className="flex-1"
          style={{ height: `${20 + Math.random() * 60}%` }}
        />
      ))}
    </div>
  );
}

// Loading spinner
interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className }: SpinnerProps) {
  const sizeClass = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  }[size];

  return (
    <motion.div
      className={cn("border-2 border-panel-border border-t-accent-primary rounded-full", sizeClass, className)}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    />
  );
}

// Page transition wrapper
interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// Stagger container for grid items
interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function StaggerContainer({ children, className, staggerDelay = 0.05 }: StaggerContainerProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}
