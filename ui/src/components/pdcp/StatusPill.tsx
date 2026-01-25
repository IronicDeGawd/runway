import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusPillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[18px] font-medium transition-colors",
  {
    variants: {
      variant: {
        running: "bg-status-running/15 text-status-running",
        stopped: "bg-[hsl(0_0%_100%/0.1)] text-text-secondary",
        warning: "bg-status-warning/15 text-status-warning",
        error: "bg-status-error/15 text-status-error",
        building: "bg-status-building/15 text-status-building",
        default: "bg-[hsl(0_0%_100%/0.1)] text-text-secondary",
      },
      size: {
        sm: "px-2 py-1 text-[11px]",
        md: "px-2.5 py-1.5 text-[11px]",
        lg: "px-3 py-1.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusPillVariants> {
  pulse?: boolean;
  dot?: boolean;
  glow?: boolean;
}

export const StatusPill = React.forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ className, variant, size, pulse = false, dot = true, glow = false, children, ...props }, ref) => {
    const isActive = variant === "running" || variant === "building";

    return (
      <span
        ref={ref}
        className={cn(
          statusPillVariants({ variant, size }), 
          glow && variant === "running" && "shadow-[0_0_12px_-2px_hsl(var(--status-running)/0.5)]",
          glow && variant === "building" && "shadow-[0_0_12px_-2px_hsl(var(--status-building)/0.5)]",
          className
        )}
        {...props}
      >
        {dot && (
          <span className="relative flex h-1.5 w-1.5">
            {pulse && isActive && (
              <span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                  variant === "running" && "bg-status-running",
                  variant === "building" && "bg-status-building"
                )}
              />
            )}
            <span
              className={cn(
                "relative inline-flex rounded-full h-1.5 w-1.5",
                variant === "running" && "bg-status-running",
                variant === "stopped" && "bg-status-stopped",
                variant === "warning" && "bg-status-warning",
                variant === "error" && "bg-status-error",
                variant === "building" && "bg-status-building",
                variant === "default" && "bg-text-muted"
              )}
            />
          </span>
        )}
        <span className="capitalize">{children}</span>
      </span>
    );
  }
);
StatusPill.displayName = "StatusPill";

// Filter chip / badge
const filterChipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[20px] border text-[12px] font-medium transition-all cursor-pointer",
  {
    variants: {
      active: {
        true: "bg-accent-primary text-accent-primary-foreground border-accent-primary shadow-glow-accent",
        false: "bg-[hsl(0_0%_100%/0.05)] text-text-secondary border-[hsl(0_0%_100%/0.08)] hover:bg-[hsl(0_0%_100%/0.08)] hover:border-[hsl(0_0%_100%/0.12)]",
      },
      size: {
        sm: "px-2.5 py-1",
        md: "px-3 py-1.5",
        lg: "px-4 py-2",
      },
    },
    defaultVariants: {
      active: false,
      size: "md",
    },
  }
);

export interface FilterChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof filterChipVariants> {
  icon?: React.ReactNode;
}

export const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(
  ({ className, active, size, icon, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          filterChipVariants({ active, size }), 
          "hover:scale-[1.02] active:scale-[0.98] transition-transform duration-175", 
          className
        )}
        {...props}
      >
        {icon}
        {children}
      </button>
    );
  }
);
FilterChip.displayName = "FilterChip";

// Runtime badge
const runtimeBadgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide",
  {
    variants: {
      runtime: {
        node: "bg-[hsl(78_100%_61%/0.12)] text-[hsl(78_80%_55%)]",
        python: "bg-[hsl(200_80%_55%/0.12)] text-[hsl(200_70%_60%)]",
        go: "bg-[hsl(190_70%_50%/0.12)] text-[hsl(190_60%_55%)]",
        rust: "bg-[hsl(25_80%_50%/0.12)] text-[hsl(25_70%_55%)]",
        static: "bg-[hsl(0_0%_100%/0.08)] text-text-secondary",
        docker: "bg-[hsl(200_80%_55%/0.12)] text-[hsl(200_70%_60%)]",
      },
    },
    defaultVariants: {
      runtime: "node",
    },
  }
);

export interface RuntimeBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof runtimeBadgeVariants> {}

export const RuntimeBadge = React.forwardRef<HTMLSpanElement, RuntimeBadgeProps>(
  ({ className, runtime, children, ...props }, ref) => {
    return (
      <span ref={ref} className={cn(runtimeBadgeVariants({ runtime }), className)} {...props}>
        {children || runtime}
      </span>
    );
  }
);
RuntimeBadge.displayName = "RuntimeBadge";
