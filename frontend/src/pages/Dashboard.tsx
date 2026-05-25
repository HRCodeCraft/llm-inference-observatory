import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Cell, Legend,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { api, ModelCostBreakdown } from "../services/api";
import { MetricCard } from "../components/MetricCard";
import { LatencyBadge } from "../components/LatencyBadge";
import { StatusBadge } from "../components/StatusBadge";
import { SkeletonCard } from "../components/Skeleton";
import { useWebSocket } from "../hooks/useWebSocket";
import { useStore } from "../store";

const PROVIDER_COLORS_MAP: Record<string, string> = {
  openai: "#00A67E",
  anthropic: "#FF6B35",
  google: "#4285F4",
  deepseek: "#9D00FF",
  grok: "#00E5FF",
};

function CostBar({ model, usd, maxUsd }: { model: ModelCostBreakdown; usd: number; maxUsd: number }) {
  const pct = maxUsd > 0 ? (usd / maxUsd) * 100 : 0;
  const color = PROVIDER_COLORS_MAP[model.provider.toLowerCase()] ?? "#00E5FF";
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs font-mono truncate flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
        {model.model.replace("claude-", "").replace("gemini-", "").replace("gpt-", "GPT-")}
      </div>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: "var(--surface-hover)" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ height: "100%", background: color, borderRadius: 9999 }}
        />
      </div>
      <div className="w-16 text-right text-xs font-mono flex-shrink-0" style={{ color }}>
        ${usd < 0.001 ? usd.toFixed(6) : usd < 0.01 ? usd.toFixed(4) : usd.toFixed(4)}
      </div>
      <div className="w-14 text-right text-xs font-mono flex-shrink-0" style={{ color: "var(--text-muted)" }}>
        {model.total_tokens.toLocaleString()}t
      </div>
    </div>
  );
}

const PROVIDER_COLORS = ["#00E5FF", "#9D00FF", "#00FF88", "#FF3366", "#FFB800"];

const WS_URL = (() => {
  const base = import.meta.env.VITE_INGESTION_URL || window.location.origin;
  return base.replace(/^http/, "ws") + "/ws/logs";
})();

export function Dashboard() {
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["metrics-summary"],
    queryFn: api.metrics.summary,
  });

  const { data: timeseries } = useQuery({
    queryKey: ["timeseries-latency"],
    queryFn: () => api.metrics.timeseries("latency", "24h"),
  });

  const { data: costData } = useQuery({
    queryKey: ["cost-summary"],
    queryFn: api.metrics.cost,
    refetchInterval: 30_000,
  });

  const { liveEvents, addLiveEvent, theme } = useStore();

  const tickColor = theme === "dark" ? "rgba(255,255,255,0.3)" : "rgba(10,15,30,0.4)";
  const tooltipBg = theme === "dark" ? "rgba(2,4,8,0.95)" : "rgba(255,255,255,0.98)";
  const tooltipBorder = theme === "dark" ? "rgba(0,229,255,0.2)" : "rgba(0,123,158,0.2)";

  const onMessage = useCallback(
    (data: string) => {
      try {
        const event = JSON.parse(data);
        if (event.type === "inference_log") {
          addLiveEvent({
            id: event.log_id ?? Math.random().toString(36),
            timestamp: event.timestamp,
            provider: event.provider,
            model: event.model,
            latency_ms: event.latency_ms,
            total_tokens: event.total_tokens,
            status: event.status,
            conversation_id: event.conversation_id,
          });
        }
      } catch { /* ignore */ }
    },
    [addLiveEvent]
  );

  useWebSocket({ url: WS_URL, onMessage });

  const chartData = (timeseries ?? []).map((p) => ({
    time: new Date(p.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
    value: Math.round(p.value),
  }));

  const providerData = (metrics?.provider_breakdown ?? []).map((p, i) => ({
    name: p.provider,
    value: p.count,
    fill: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
  }));

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-y-auto">
      {/* Hero metrics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {metricsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              label="Total Conversations"
              value={metrics?.total_conversations ?? 0}
              accent="#00E5FF"
              subtitle="all time"
            />
            <MetricCard
              label="Total Tokens Used"
              value={metrics?.total_tokens ?? 0}
              accent="#9D00FF"
              subtitle="cumulative"
            />
            <MetricCard
              label="Avg Latency"
              value={metrics?.avg_latency_ms ?? 0}
              unit="ms"
              decimals={0}
              accent="#00FF88"
              subtitle={`p95: ${metrics?.p95_latency?.toFixed(0) ?? "—"}ms`}
            />
            <MetricCard
              label="Error Rate"
              value={metrics?.error_rate ?? 0}
              unit="%"
              decimals={2}
              accent="#FF3366"
              subtitle={`${metrics?.total_messages ?? 0} messages`}
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Latency chart */}
        <div className="card p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Latency Distribution
            </span>
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
              Last 24h
            </span>
          </div>
          {chartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center" style={{ minHeight: 160 }}>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>No data yet</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--cyan)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--cyan)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 9, fill: tickColor, fontFamily: "Space Mono" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: tickColor, fontFamily: "Space Mono" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "Space Mono",
                    color: "var(--cyan)",
                  }}
                  formatter={(v: number) => [`${v}ms`, "Avg Latency"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--cyan)"
                  strokeWidth={2}
                  fill="url(#cyanGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Provider breakdown */}
        <div className="card p-5 flex flex-col gap-4">
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Provider Breakdown
          </span>
          {providerData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center" style={{ minHeight: 160 }}>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>No data yet</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="30%"
                outerRadius="80%"
                data={providerData}
                startAngle={180}
                endAngle={0}
              >
                <RadialBar dataKey="value" cornerRadius={4} background={{ fill: "var(--surface)" }}>
                  {providerData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </RadialBar>
                <Legend
                  iconSize={8}
                  iconType="circle"
                  formatter={(v) => (
                    <span style={{ color: tickColor, fontSize: 10, fontFamily: "Space Mono" }}>
                      {v}
                    </span>
                  )}
                />
                <Tooltip
                  contentStyle={{
                    background: tooltipBg,
                    border: `1px solid var(--border)`,
                    borderRadius: 8,
                    fontSize: 11,
                    color: "var(--text-primary)",
                  }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Cost Intelligence */}
      <div className="card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Cost Intelligence
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded font-mono"
              style={{ background: "rgba(157,0,255,0.08)", color: "var(--violet)", border: "1px solid rgba(157,0,255,0.2)" }}
            >
              est. spend
            </span>
          </div>
          <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            {costData?.days_of_data ?? 0}d of data
          </span>
        </div>

        {!costData || costData.by_model.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>No cost data yet — run a chat to see estimates</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Spend summary cards */}
            <div className="flex flex-col gap-3">
              <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "var(--surface-hover)", border: "1px solid var(--border)" }}>
                <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>Total Estimated Spend</span>
                <span className="text-2xl font-heading font-bold" style={{ color: "var(--violet)" }}>
                  ${costData.total_estimated_usd < 0.01
                    ? costData.total_estimated_usd.toFixed(6)
                    : costData.total_estimated_usd.toFixed(4)}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>based on public rate cards</span>
              </div>
              <div className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "var(--surface-hover)", border: "1px solid var(--border)" }}>
                <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>Projected Monthly</span>
                <span className="text-xl font-heading font-bold" style={{ color: costData.projected_monthly_usd > 100 ? "var(--danger)" : "var(--success)" }}>
                  ${costData.projected_monthly_usd.toFixed(2)}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>at current rate × 30d</span>
              </div>
            </div>

            {/* Model cost bars */}
            <div className="xl:col-span-2 flex flex-col gap-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>Cost by Model</span>
                <div className="flex gap-3 text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                  <span>cost</span>
                  <span>tokens</span>
                </div>
              </div>
              {costData.by_model.map((m) => (
                <CostBar
                  key={`${m.provider}/${m.model}`}
                  model={m}
                  usd={m.estimated_cost_usd}
                  maxUsd={Math.max(...costData.by_model.map((x) => x.estimated_cost_usd))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Insight pills */}
        {costData && costData.by_model.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
            {costData.cheapest_model && (
              <span className="text-xs px-3 py-1 rounded-full font-mono" style={{ background: "rgba(0,255,136,0.08)", color: "var(--success)", border: "1px solid rgba(0,255,136,0.2)" }}>
                ↓ Cheapest: {costData.cheapest_model}
              </span>
            )}
            {costData.most_used_model && (
              <span className="text-xs px-3 py-1 rounded-full font-mono" style={{ background: "rgba(0,229,255,0.08)", color: "var(--cyan)", border: "1px solid rgba(0,229,255,0.15)" }}>
                ◉ Most used: {costData.most_used_model}
              </span>
            )}
            {costData.best_efficiency_model && costData.best_efficiency_model !== costData.cheapest_model && (
              <span className="text-xs px-3 py-1 rounded-full font-mono" style={{ background: "rgba(157,0,255,0.08)", color: "var(--violet)", border: "1px solid rgba(157,0,255,0.2)" }}>
                ⚡ Best efficiency: {costData.best_efficiency_model}
              </span>
            )}
            <span className="text-xs px-3 py-1 rounded-full font-mono ml-auto" style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              pricing: blended public rate cards
            </span>
          </div>
        )}
      </div>

      {/* Live feed */}
      <div className="card p-5 flex flex-col gap-4 flex-1 min-h-0">
        <div className="flex items-center gap-3">
          <span className="pulse-dot" style={{ background: "var(--cyan)" }} />
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Live Feed
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded font-mono"
            style={{ background: "rgba(0,229,255,0.08)", color: "var(--cyan)", border: "1px solid rgba(0,229,255,0.15)" }}
          >
            WebSocket
          </span>
        </div>

        {/* Header */}
        <div
          className="grid text-xs font-mono uppercase tracking-wide pb-2 border-b"
          style={{
            gridTemplateColumns: "140px 1fr 1fr 80px 70px 80px",
            color: "var(--text-muted)",
            borderColor: "var(--border)",
          }}
        >
          <span>Timestamp</span>
          <span>Provider</span>
          <span>Model</span>
          <span>Latency</span>
          <span>Tokens</span>
          <span>Status</span>
        </div>

        <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 280 }}>
          {liveEvents.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center flex flex-col items-center gap-3">
                <span className="text-3xl">◎</span>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Awaiting inference events...
                </span>
                <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                  Events appear here in real time via WebSocket
                </span>
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {liveEvents.map((event) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="grid items-center py-2 px-1 rounded-lg text-sm transition-colors"
                  style={{
                    gridTemplateColumns: "140px 1fr 1fr 80px 70px 80px",
                    cursor: "default",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {new Date(event.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                  </span>
                  <span
                    className="font-mono text-xs px-2 py-0.5 rounded w-fit"
                    style={{ background: "rgba(0,229,255,0.08)", color: "var(--cyan)", border: "1px solid rgba(0,229,255,0.15)" }}
                  >
                    {event.provider}
                  </span>
                  <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                    {event.model}
                  </span>
                  <LatencyBadge ms={event.latency_ms} />
                  <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {event.total_tokens > 0 ? event.total_tokens.toLocaleString() : "—"}
                  </span>
                  <StatusBadge status={event.status} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
