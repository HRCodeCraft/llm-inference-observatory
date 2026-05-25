interface LatencyBadgeProps {
  ms: number | null;
}

export function LatencyBadge({ ms }: LatencyBadgeProps) {
  if (ms === null || ms === undefined) {
    return (
      <span
        className="badge"
        style={{ background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }}
      >
        —
      </span>
    );
  }

  const color  = ms < 500 ? "var(--success)" : ms < 2000 ? "#FFB800" : "var(--danger)";
  const bg     = ms < 500 ? "rgba(0,255,136,0.08)" : ms < 2000 ? "rgba(255,184,0,0.08)" : "rgba(255,51,102,0.08)";
  const border = ms < 500 ? "rgba(0,255,136,0.2)"  : ms < 2000 ? "rgba(255,184,0,0.2)"  : "rgba(255,51,102,0.2)";

  return (
    <span className="badge" style={{ background: bg, color, borderColor: border }}>
      {ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`}
    </span>
  );
}
