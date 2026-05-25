interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<string, { bg: string; color: string; border: string }> = {
  active:    { bg: "rgba(0,229,255,0.10)",  color: "var(--cyan)",    border: "rgba(0,229,255,0.25)" },
  completed: { bg: "rgba(0,255,136,0.08)",  color: "var(--success)", border: "rgba(0,255,136,0.22)" },
  cancelled: { bg: "rgba(255,51,102,0.08)", color: "var(--danger)",  border: "rgba(255,51,102,0.22)" },
  success:   { bg: "rgba(0,255,136,0.08)",  color: "var(--success)", border: "rgba(0,255,136,0.22)" },
  error:     { bg: "rgba(255,51,102,0.08)", color: "var(--danger)",  border: "rgba(255,51,102,0.22)" },
};

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? {
    bg: "var(--surface)",
    color: "var(--text-secondary)",
    border: "var(--border)",
  };

  return (
    <span
      className="badge gap-1.5"
      style={{
        background: cfg.bg,
        color: cfg.color,
        borderColor: cfg.border,
        fontSize: size === "sm" ? 10 : 12,
      }}
    >
      <span
        className={status === "active" ? "pulse-dot" : ""}
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: cfg.color,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {status.toUpperCase()}
    </span>
  );
}
