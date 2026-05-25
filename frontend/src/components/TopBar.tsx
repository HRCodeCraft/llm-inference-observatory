import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../store";

export function TopBar() {
  const [time, setTime] = useState(new Date());
  const { theme, toggleTheme } = useStore();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isDark = theme === "dark";

  return (
    <div
      className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
      style={{
        borderColor: "var(--border)",
        background: "var(--topbar-bg)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="font-heading font-bold text-xl tracking-widest"
          style={{ color: "var(--cyan)" }}
        >
          INFERIQ
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-mono"
          style={{
            background: "rgba(0,255,136,0.1)",
            color: "var(--success)",
            border: "1px solid rgba(0,255,136,0.25)",
          }}
        >
          v1.0
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <span className="pulse-dot" style={{ background: "var(--success)" }} />
          <span className="text-xs font-mono" style={{ color: "var(--success)" }}>
            LIVE
          </span>
        </div>

        {/* Clock */}
        <span className="font-mono text-xs hidden sm:block" style={{ color: "var(--text-muted)" }}>
          {time.toLocaleTimeString("en-US", { hour12: false })}
        </span>

        {/* Theme toggle */}
        <motion.button
          onClick={toggleTheme}
          whileTap={{ scale: 0.9 }}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="relative w-10 h-6 rounded-full flex items-center px-0.5 transition-colors duration-300 focus:outline-none"
          style={{
            background: isDark
              ? "rgba(0,229,255,0.15)"
              : "rgba(0,123,158,0.12)",
            border: "1px solid var(--border-strong)",
          }}
          aria-label="Toggle theme"
        >
          {/* Track icons */}
          <span
            className="absolute left-1 text-[10px] leading-none pointer-events-none"
            style={{ opacity: isDark ? 1 : 0, transition: "opacity 0.2s" }}
          >
            🌙
          </span>
          <span
            className="absolute right-1 text-[10px] leading-none pointer-events-none"
            style={{ opacity: isDark ? 0 : 1, transition: "opacity 0.2s" }}
          >
            ☀️
          </span>
          {/* Thumb */}
          <motion.span
            layout
            className="w-4 h-4 rounded-full shadow-sm flex-shrink-0"
            animate={{ x: isDark ? 0 : 16 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            style={{
              background: isDark ? "#00E5FF" : "#007B9E",
              boxShadow: isDark
                ? "0 0 6px rgba(0,229,255,0.5)"
                : "0 0 6px rgba(0,123,158,0.4)",
            }}
          />
        </motion.button>
      </div>
    </div>
  );
}
