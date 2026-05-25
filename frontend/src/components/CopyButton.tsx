import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CopyButtonProps {
  text: string;
  className?: string;
}

export function CopyButton({ text, className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className={`copy-btn flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono transition-all ${className}`}
      style={{
        background: copied ? "rgba(0,255,136,0.12)" : "var(--surface-hover)",
        border: `1px solid ${copied ? "rgba(0,255,136,0.3)" : "var(--border)"}`,
        color: copied ? "var(--success)" : "var(--text-muted)",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            ✓ Copied
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            ⎘ Copy
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
