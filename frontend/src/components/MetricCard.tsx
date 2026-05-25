import { motion } from "framer-motion";
import { useCountUp } from "../hooks/useCountUp";

interface MetricCardProps {
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
  accent?: string;
  trend?: number;
  subtitle?: string;
}

export function MetricCard({
  label,
  value,
  unit = "",
  decimals = 0,
  accent = "var(--cyan)",
  trend,
  subtitle,
}: MetricCardProps) {
  const animated = useCountUp(value);
  const display =
    decimals > 0
      ? animated.toFixed(decimals)
      : Math.round(animated).toLocaleString();

  return (
    <motion.div
      className="card card-glow metric-card-pulse p-5 flex flex-col gap-2 relative overflow-hidden"
      style={{ borderBottom: `2px solid ${accent}` }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${accent === "var(--cyan)" ? "rgba(0,229,255,0.12)" : accent + "18"} 0%, transparent 70%)`,
        }}
      />

      <span className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>

      <div className="flex items-end gap-2">
        <span className="text-3xl font-heading font-bold leading-none" style={{ color: "var(--text-primary)" }}>
          {display}
        </span>
        {unit && (
          <span className="text-sm font-mono mb-0.5" style={{ color: accent }}>
            {unit}
          </span>
        )}
      </div>

      {(trend !== undefined || subtitle) && (
        <div className="flex items-center gap-2">
          {trend !== undefined && (
            <span className="text-xs font-mono" style={{ color: trend >= 0 ? "var(--success)" : "var(--danger)" }}>
              {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
            </span>
          )}
          {subtitle && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </span>
          )}
        </div>
      )}

      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
    </motion.div>
  );
}
