# Architecture Notes — InferIQ

## Ingestion Flow

```
User types message in Chat UI
        │
        ▼
SDK wraps the LLM fetch call, starts a timer
        │
        ▼
LLM Provider API (OpenAI / Anthropic / Google / DeepSeek / Grok)
responds via SSE stream or single response
        │
        ▼
SDK captures: token counts, latency, status, input/output previews
Applies client-side PII redaction before payload leaves the browser
        │
        ▼ (fire-and-forget, non-blocking)
POST /api/ingest/log  ──► Ingestion API (FastAPI, port 8000)
        │
        ├──► Pydantic v2 validation + server-side PII redaction
        │
        ├──► PostgreSQL write:
        │      - upsert Conversation (title, provider, model, status)
        │      - insert Message (role, content_preview, sequence_number)
        │      - insert InferenceLog (latency_ms, tokens, timestamps, status)
        │
        └──► Redis PUBLISH inference_events
                    │
                    ▼
            WebSocket /ws/logs
                    │
                    ▼
        Browser Dashboard (live event feed updates in real time)
```

---

## Logging Strategy

**Fire-and-forget with retry:** The SDK sends logs asynchronously after the LLM responds. Logging never blocks the chat UX — if the ingestion endpoint is down, the user's conversation is unaffected.

**Retry policy:** 3 attempts with exponential backoff — 200ms → 600ms → 1400ms. After 3 failures, the error is passed to the configured `onError` callback and silently dropped.

**Dual-layer PII redaction:**
- Layer 1 (SDK, client-side): Redacts emails, phone numbers, credit cards, Aadhaar IDs, and name patterns from input/output previews before the payload is sent over the network.
- Layer 2 (Ingestion API, server-side): Re-applies the same redaction patterns on receipt, before any database write. This defends against SDK misconfiguration or direct API calls that bypass the SDK.

**UUID-first design:** `conversation_id` and `session_id` are generated client-side in the SDK. This means logging can start immediately with no server round-trip to obtain an ID, and retried payloads are idempotent (same `log_id` twice is a no-op).

**Content preview instead of full content:** Input and output are stored as 200-character previews, applied after PII redaction. This caps storage growth and keeps dashboard queries fast without scanning large text fields.

---

## Scaling Considerations

### Ingestion API (stateless — scale horizontally)
Each pod is independent and shares no state with other pods. Scale by adding replicas behind a load balancer. The only shared state is PostgreSQL and Redis, which are centralized.

**WebSocket fan-out across multiple pods:** Currently Redis pub/sub broadcasts to all subscribers. In a multi-pod setup, each pod independently subscribes to the Redis channel and forwards to its own connected WebSocket clients — this works correctly without any pod coordination. For higher throughput, switch to Redis Streams (`XADD` / `XREAD`) with consumer groups to guarantee at-least-once delivery.

### PostgreSQL
- Read replicas for metrics and cost queries (read-heavy, can lag writes)
- Partition `inference_logs` by month at ~50M rows
- Connection pool capped at 20 per ingestion pod (`database.py`)
- Indexes on `request_timestamp`, `provider`, `conversation_id` for hot metrics queries

### Redis
- Switch to Redis Cluster at ~100k pub/sub messages/second
- Current single-node setup is adequate for moderate traffic

### Frontend
- Static build (`npm run build`) deployable to any CDN
- Content-hashed assets get `Cache-Control: immutable` headers
- API and WebSocket proxied via nginx in production (`frontend/nginx.conf`)

---

## Failure Handling Assumptions

| Component | Failure Mode | Behavior |
|-----------|-------------|----------|
| SDK → Ingestion | Network error or non-2xx response | Retries 3× with exponential backoff, then calls `onError` and drops silently. Chat UX is never blocked. |
| Ingestion → PostgreSQL | Connection error | SQLAlchemy pool retries; transaction rolls back on failure; returns HTTP 500 to SDK (triggers SDK retry). |
| Ingestion → Redis | Pub/sub publish fails | Event is dropped from the live feed; the PostgreSQL write already committed and is not rolled back. Telemetry is durable even if the live feed misses events. |
| WebSocket client | Connection drops | Browser auto-reconnects after 3 seconds, indefinitely (`useWebSocket.ts`). |
| PostgreSQL pool | All 20 connections exhausted | HTTP 503 after pool timeout. Resolved by scaling ingestion replicas or increasing pool size. |
| Malformed SDK payload | Schema validation fails | Pydantic returns HTTP 422 with field-level error details. SDK treats non-2xx as a failure and retries. |
| LLM provider API | Error during streaming | SDK sets `status=error`, captures `error_message`, and still fires the log. Chat UI shows a toast notification. The conversation is never silently lost. |
| LLM provider API | Missing `usage` in stream | Token counts default to 0. Logging still completes. Noted in tradeoffs — streaming APIs do not always emit usage in the final chunk. |
