import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const panelCardVariants = cva(
  "relative rounded-3xl transition-all duration-175 border border-panel-border",
  {
    variants: {
      variant: {
        default: "bg-panel shadow-card",
        elevated: "bg-surface-elevated shadow-card-hover",
        ghost: "bg-transparent shadow-none border-transparent",
        accent: "bg-accent-primary-muted border-accent-primary/20 shadow-card",
      },
      hover: {
        true: "hover:shadow-card-hover hover:-translate-y-0.5 cursor-pointer",
        false: "",
      },
      padding: {
        none: "p-0",
        sm: "p-4",
        md: "p-6",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "default",
      hover: false,
      padding: "md",
    },
  }
);

export interface PanelCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof panelCardVariants> {
  animate?: boolean;
  delay?: number;
}

const PanelCard = React.forwardRef<HTMLDivElement, PanelCardProps>(
  ({ className, variant, hover, padding, animate = true, delay = 0, children, ...props }, ref) => {
    if (!animate) {
      return (
        <div
          ref={ref}
          className={cn(panelCardVariants({ variant, hover, padding }), className)}
          {...(props as React.HTMLAttributes<HTMLDivElement>)}
        >
          {children}
        </div>
      );
    }

    return (
      <motion.div
        ref={ref}
        className={cn(panelCardVariants({ variant, hover, padding }), className)}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay, ease: "easeOut" }}
        whileHover={hover ? { scale: 1.01, y: -2 } : undefined}
      >
        {children}
      </motion.div>
    );
  }
);
PanelCard.displayName = "PanelCard";

const PanelCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center justify-between mb-4", className)}
    {...props}
  />
));
PanelCardHeader.displayName = "PanelCardHeader";

const PanelCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-sm font-medium text-text-secondary", className)}
    {...props}
  />
));
PanelCardTitle.displayName = "PanelCardTitle";

const PanelCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props} />
));
PanelCardContent.displayName = "PanelCardContent";

export { PanelCard, PanelCardHeader, PanelCardTitle, PanelCardContent, panelCardVariants };
