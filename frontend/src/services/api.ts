const BASE = import.meta.env.VITE_INGESTION_URL || "";
const TAG = "[InferIQ:API]";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? "GET";
  console.log(TAG, `${method} ${path}`);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (err) {
    console.error(TAG, `Network error: ${method} ${path}`, err);
    throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  let json: { success: boolean; data?: T; error?: string };
  try {
    json = await res.json();
  } catch {
    console.error(TAG, `Non-JSON response: ${method} ${path} status=${res.status}`);
    throw new Error(`Server returned non-JSON response (HTTP ${res.status})`);
  }

  if (!json.success) {
    console.error(TAG, `API error: ${method} ${path} status=${res.status} error=${json.error}`);
    throw new Error(json.error ?? `API error (HTTP ${res.status})`);
  }

  console.log(TAG, `${method} ${path} → ${res.status} OK`);
  return json.data as T;
}

export interface Conversation {
  id: string;
  session_id: string;
  title: string | null;
  provider: string;
  model: string;
  status: "active" | "cancelled" | "completed";
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  content_preview: string | null;
  created_at: string;
  sequence_number: number;
}

export interface MetricsSummary {
  total_conversations: number;
  total_messages: number;
  total_tokens: number;
  avg_latency_ms: number | null;
  error_rate: number;
  provider_breakdown: { provider: string; count: number; avg_latency: number | null }[];
  model_breakdown: { model: string; count: number }[];
  hourly_volume: { hour: string; count: number }[];
  p50_latency: number | null;
  p95_latency: number | null;
  p99_latency: number | null;
}

export interface TimeseriesPoint {
  timestamp: string;
  value: number;
}

export interface ModelCostBreakdown {
  provider: string;
  model: string;
  total_tokens: number;
  call_count: number;
  estimated_cost_usd: number;
  avg_latency_ms: number | null;
  cost_per_1k_tokens: number;
}

export interface CostSummary {
  total_estimated_usd: number;
  projected_monthly_usd: number;
  days_of_data: number;
  by_model: ModelCostBreakdown[];
  most_used_model: string | null;
  cheapest_model: string | null;
  best_efficiency_model: string | null;
}

export const api = {
  conversations: {
    list: () => apiFetch<Conversation[]>("/api/conversations"),
    get: (id: string) =>
      apiFetch<Conversation & { messages: Message[] }>(`/api/conversations/${id}`),
    messages: (id: string) => apiFetch<Message[]>(`/api/conversations/${id}/messages`),
    cancel: (id: string) =>
      apiFetch<Conversation>(`/api/conversations/${id}/cancel`, { method: "PATCH" }),
    update: (id: string, body: { title?: string }) =>
      apiFetch<Conversation>(`/api/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      apiFetch<{ deleted: string }>(`/api/conversations/${id}`, { method: "DELETE" }),
  },
  metrics: {
    summary: () => apiFetch<MetricsSummary>("/api/metrics/summary"),
    timeseries: (metric: string, interval: string) =>
      apiFetch<TimeseriesPoint[]>(
        `/api/metrics/timeseries?metric=${metric}&interval=${interval}`
      ),
    cost: () => apiFetch<CostSummary>("/api/metrics/cost"),
  },
};
