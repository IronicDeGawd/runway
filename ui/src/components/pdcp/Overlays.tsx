import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

// Modal
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function Modal({ open, onClose, title, description, children, size = "md", className }: ModalProps) {
  const sizeClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  }[size];

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-surface-overlay/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={cn(
              "fixed left-1/2 top-1/2 z-50 w-full p-6 bg-panel border border-panel-border rounded-xl shadow-elevated",
              sizeClass,
              className
            )}
            initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
            transition={{ duration: 0.2 }}
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            {(title || description) && (
              <div className="mb-4">
                {title && <h2 className="text-lg font-semibold text-text-primary">{title}</h2>}
                {description && <p className="text-sm text-text-secondary mt-1">{description}</p>}
              </div>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Drawer (slide-in panel)
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: "left" | "right";
  className?: string;
}

export function PDCPDrawer({ open, onClose, title, children, side = "right", className }: DrawerProps) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const slideVariants = {
    left: {
      initial: { x: "-100%" },
      animate: { x: 0 },
      exit: { x: "-100%" },
    },
    right: {
      initial: { x: "100%" },
      animate: { x: 0 },
      exit: { x: "100%" },
    },
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-surface-overlay/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={cn(
              "fixed top-0 z-50 h-full w-full max-w-md bg-panel border-panel-border shadow-elevated",
              side === "left" ? "left-0 border-r" : "right-0 border-l",
              className
            )}
            initial={slideVariants[side].initial}
            animate={slideVariants[side].animate}
            exit={slideVariants[side].exit}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="flex items-center justify-between p-4 border-b border-panel-border">
              {title && <h2 className="text-lg font-semibold text-text-primary">{title}</h2>}
              <button
                onClick={onClose}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Toast notification
interface ToastProps {
  message: string;
  type?: "success" | "error" | "warning" | "info";
  onClose: () => void;
}

export function Toast({ message, type = "info", onClose }: ToastProps) {
  const typeStyles = {
    success: "bg-status-running/10 border-status-running/30 text-status-running",
    error: "bg-status-error/10 border-status-error/30 text-status-error",
    warning: "bg-status-warning/10 border-status-warning/30 text-status-warning",
    info: "bg-accent-primary/10 border-accent-primary/30 text-accent-primary",
  };

  React.useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg border shadow-elevated",
        typeStyles[type]
      )}
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      transition={{ duration: 0.2 }}
    >
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-auto">
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

// Toast container
interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type?: "success" | "error" | "warning" | "info" }>;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => onRemove(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// Confirm dialog
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-text-secondary mb-6">{description}</p>
        )}
        <div className="flex gap-3 justify-center">
          <motion.button
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-secondary border border-panel-border rounded-md hover:bg-panel-hover transition-colors"
            onClick={onClose}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {cancelLabel}
          </motion.button>
          <motion.button
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors",
              variant === "danger"
                ? "bg-status-error text-white hover:bg-status-error/90"
                : "bg-accent-primary text-accent-primary-foreground hover:bg-accent-primary-hover"
            )}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {confirmLabel}
          </motion.button>
        </div>
      </div>
    </Modal>
  );
}
