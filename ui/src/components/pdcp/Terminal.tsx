import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TerminalProps {
  logs: string[];
  className?: string;
  maxHeight?: string;
  streaming?: boolean;
}

export function Terminal({ logs, className, maxHeight = "300px", streaming = false }: TerminalProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      className={cn(
        "bg-surface-overlay rounded-lg border border-panel-border overflow-hidden font-mono text-xs",
        className
      )}
    >
      <div className="flex items-center gap-1.5 px-3 py-2 bg-panel border-b border-panel-border">
        <div className="w-3 h-3 rounded-full bg-status-error/60" />
        <div className="w-3 h-3 rounded-full bg-status-warning/60" />
        <div className="w-3 h-3 rounded-full bg-status-running/60" />
        <span className="ml-2 text-text-muted text-2xs">Terminal</span>
      </div>
      <div
        ref={containerRef}
        className="p-3 overflow-y-auto"
        style={{ maxHeight }}
      >
        {logs.map((log, i) => (
          <motion.div
            key={i}
            className="text-text-secondary leading-relaxed"
            initial={streaming ? { opacity: 0, x: -10 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
          >
            <span className="text-text-muted select-none mr-2">{String(i + 1).padStart(3, " ")}</span>
            <LogLine content={log} />
          </motion.div>
        ))}
        {streaming && (
          <span className="inline-block w-2 h-4 bg-accent-primary terminal-cursor ml-1" />
        )}
      </div>
    </div>
  );
}

// Parse and colorize log lines
function LogLine({ content }: { content: string }) {
  // Simple syntax highlighting
  const patterns = [
    { regex: /\[ERROR\]/g, className: "text-status-error" },
    { regex: /\[WARN\]/g, className: "text-status-warning" },
    { regex: /\[INFO\]/g, className: "text-status-building" },
    { regex: /\[SUCCESS\]/g, className: "text-status-running" },
    { regex: /\[DEBUG\]/g, className: "text-text-muted" },
    { regex: /(https?:\/\/[^\s]+)/g, className: "text-accent-primary underline" },
    { regex: /(".*?")/g, className: "text-status-warning" },
    { regex: /(\d+\.\d+\.\d+)/g, className: "text-accent-primary" },
  ];

  let result = content;
  let elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let matches: Array<{ index: number; length: number; text: string; className: string }> = [];

  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.regex.source, "g");
    while ((match = regex.exec(content)) !== null) {
      matches.push({
        index: match.index,
        length: match[0].length,
        text: match[0],
        className: pattern.className,
      });
    }
  }

  // Sort by index
  matches.sort((a, b) => a.index - b.index);

  // Remove overlapping matches
  const filteredMatches: typeof matches = [];
  let lastEnd = 0;
  for (const match of matches) {
    if (match.index >= lastEnd) {
      filteredMatches.push(match);
      lastEnd = match.index + match.length;
    }
  }

  // Build elements
  for (const match of filteredMatches) {
    if (match.index > lastIndex) {
      elements.push(content.slice(lastIndex, match.index));
    }
    elements.push(
      <span key={match.index} className={match.className}>
        {match.text}
      </span>
    );
    lastIndex = match.index + match.length;
  }

  if (lastIndex < content.length) {
    elements.push(content.slice(lastIndex));
  }

  return <>{elements.length > 0 ? elements : content}</>;
}

// Code block
interface CodeBlockProps {
  code: string;
  language?: string;
  showCopy?: boolean;
  className?: string;
}

export function CodeBlock({ code, language = "bash", showCopy = true, className }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("relative group", className)}>
      <div className="bg-surface-overlay rounded-lg border border-panel-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-panel border-b border-panel-border">
          <span className="text-2xs text-text-muted uppercase tracking-wider">{language}</span>
          {showCopy && (
            <motion.button
              className="text-text-muted hover:text-text-primary text-xs"
              onClick={handleCopy}
              whileTap={{ scale: 0.95 }}
            >
              {copied ? "Copied!" : "Copy"}
            </motion.button>
          )}
        </div>
        <pre className="p-3 overflow-x-auto">
          <code className="text-xs text-text-secondary font-mono">{code}</code>
        </pre>
      </div>
    </div>
  );
}

// Environment variable row
interface EnvRowProps {
  name: string;
  value: string;
  masked?: boolean;
  onEdit?: (value: string) => void;
  onDelete?: () => void;
}

export function EnvRow({ name, value, masked = true, onEdit, onDelete }: EnvRowProps) {
  const [showValue, setShowValue] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(value);

  const displayValue = masked && !showValue ? "•".repeat(Math.min(value.length, 20)) : value;

  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-panel rounded-md border border-panel-border group hover:bg-panel-hover transition-colors">
      <code className="text-xs text-accent-primary font-mono flex-shrink-0 w-40 truncate">
        {name}
      </code>
      <span className="text-text-muted">=</span>
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => {
            setIsEditing(false);
            onEdit?.(editValue);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setIsEditing(false);
              onEdit?.(editValue);
            }
            if (e.key === "Escape") {
              setIsEditing(false);
              setEditValue(value);
            }
          }}
          className="flex-1 bg-input border border-input-border rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
          autoFocus
        />
      ) : (
        <code className="flex-1 text-xs text-text-secondary font-mono truncate">
          {displayValue}
        </code>
      )}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {masked && (
          <button
            onClick={() => setShowValue(!showValue)}
            className="text-text-muted hover:text-text-primary text-xs px-2"
          >
            {showValue ? "Hide" : "Show"}
          </button>
        )}
        {onEdit && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-text-muted hover:text-text-primary text-xs px-2"
          >
            Edit
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-status-error/70 hover:text-status-error text-xs px-2"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
