# InferIQ — LLM Inference Intelligence

> See every token. Track every dollar. Understand every conversation.

A production-grade LLM inference logging, observability, and cost analytics platform. Every token, latency measurement, and error from any LLM provider is captured automatically — surfaced in a real-time dashboard with cost intelligence, WebSocket live feed, and a full multi-provider chatbot.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [One-Command Start (Recommended)](#one-command-start-recommended)
3. [Docker Compose Start](#docker-compose-start)
4. [Manual Start](#manual-start)
5. [API Keys Setup](#api-keys-setup)
6. [Features](#features)
7. [Architecture](#architecture)
8. [Project Structure](#project-structure)
9. [API Reference](#api-reference)
10. [SDK Usage](#sdk-usage)
11. [Schema Design Decisions](#schema-design-decisions)
12. [Tradeoffs Made](#tradeoffs-made)
13. [Scaling Considerations](#scaling-considerations)
14. [Failure Handling](#failure-handling)
15. [What I'd Improve With More Time](#what-id-improve-with-more-time)

---

## Quick Start

### Prerequisites

| Dependency | Minimum Version | Purpose |
|------------|----------------|---------|
| Docker | 20+ | Runs PostgreSQL and Redis containers |
| Python | 3.12+ | Ingestion API service |
| Node.js | 20+ | Frontend dev server and SDK build |

> **Using nvm?** Run `nvm use 20` before any `npm` commands.

You also need at least **one** LLM provider API key — see [API Keys Setup](#api-keys-setup) below.

---

## One-Command Start (Recommended)

```bash
bash dev.sh
```

That single command:
1. Starts (or reuses) PostgreSQL and Redis Docker containers
2. Builds the TypeScript SDK if source is newer than the last build
3. Installs frontend `node_modules` if missing
4. Creates a Python venv and installs dependencies if `requirements.txt` changed
5. Runs Alembic database migrations
6. Starts the ingestion API on `:8000`
7. Starts the Vite frontend dev server on `:3000`
8. Tails both logs in the terminal

Open **http://localhost:3000** — everything (UI, API, WebSocket) is on that single URL.

Press `Ctrl+C` to stop all services cleanly.

---

## Docker Compose Start

Builds and runs every service in containers — no local Python or Node required after the image build.

```bash
docker compose up --build
```

Open **http://localhost:3000**.

To stop:

```bash
docker compose down
```

Database migrations run automatically on container startup before the API starts.

---

## Manual Start

Use this if you want full control over each service.

### Step 1 — Start PostgreSQL and Redis

```bash
docker run -d --name obs-postgres \
  -e POSTGRES_DB=observatory \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 postgres:16-alpine

docker run -d --name obs-redis \
  -p 6379:6379 redis:7-alpine
```

### Step 2 — Build the SDK

The frontend depends on the compiled SDK. Build it first.

```bash
cd sdk
npm install
npm run build
```

### Step 3 — Start the Ingestion API

```bash
cd ingestion
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt

# Run database migrations (creates all tables)
DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/observatory" \
  alembic upgrade head

# Start the API
DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/observatory" \
REDIS_URL="redis://localhost:6379" \
  uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Step 4 — Start the Frontend

Open a new terminal tab:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**.

---

## API Keys Setup

API keys are stored in your **browser's localStorage only** — they never touch the ingestion server or any file in the codebase.

**How to add keys:**
1. Open the app at `http://localhost:3000`
2. Click the **⚙ gear icon** in the left sidebar
3. Paste your key for any provider you want to use
4. Click **Save Keys**

You only need **one** provider key to use the chat. The dashboard and conversation history work regardless of which provider you pick.

| Provider | Where to get a key |
|----------|--------------------|
| **OpenAI** | platform.openai.com/api-keys |
| **Anthropic** | console.anthropic.com/settings/keys |
| **Google** | aistudio.google.com/apikey |
| **DeepSeek** | platform.deepseek.com |
| **Grok (xAI)** | console.x.ai |

---

## Features

### Multi-Provider Chat

A full chatbot supporting five LLM providers from a single UI. Switch between providers with a model selector — the conversation context travels with you.

- **Providers:** GPT-4.1 (OpenAI), Claude Sonnet 4.5 (Anthropic), Gemini 2.0 Flash (Google), DeepSeek Chat, Grok 2 (xAI)
- **Streaming:** Responses render token-by-token as they arrive via SSE
- **Multi-turn context:** Last 10 messages sent as context on every turn
- **Keyboard shortcuts:** `Enter` to send, `Ctrl+Enter` to insert a newline
- **Inference metadata panel:** Slide-in panel showing latency, token count, and session ID after each response
- **Automatic logging:** Every call is silently logged to Observatory via the SDK — zero latency added to your chat

### Real-Time Dashboard

Live overview of every inference event across all providers and conversations.

- **4 metric cards:** Total Conversations, Total Tokens, Avg Latency, Error Rate — numbers animate on update
- **Latency area chart:** 24-hour time-bucketed average latency with a cyan gradient fill
- **Provider breakdown:** Radial bar chart showing call distribution across providers
- **Live event feed:** New inference events slide in via WebSocket as they happen — provider badge, model name, latency, token count, status

### Cost Intelligence

The one feature almost no observability tool ships: **real dollar estimates**, not just token counts.

- **Total estimated spend:** Calculated from actual token usage × public provider rate cards
- **Projected monthly burn:** Extrapolates your current daily rate × 30. Turns red if > $100/month
- **Per-model cost bars:** Animated horizontal bars ranked by spend, colored by provider
- **Insight pills** — three recommendations computed automatically:
  - `↓ Cheapest` — the model with the lowest rate per 1K tokens among ones you've actually used
  - `◉ Most used` — the model with the highest token volume
  - `⚡ Best efficiency` — the best cost-to-latency ratio (fastest responses per dollar)
- Pricing is sourced from public provider rate cards and clearly labeled as estimates

### Conversations

Full history of every conversation logged through the SDK.

- **Searchable list:** Filter by conversation title, provider, or model name
- **Provider and model badges:** Color-coded per provider, shows model name and status
- **Status indicators:** Active, Cancelled, Completed — with live-updating badges
- **One-click cancel:** Optimistically updates the UI before the server confirms
- **Click to open:** Opens the full conversation detail view

### Conversation Detail

Full message-by-message view of any historical conversation.

- **Complete chat history:** Every turn rendered in chat bubbles with user / assistant roles
- **Resume any conversation:** Type and send in the input box — new messages stream token by token using the same model that started the conversation
- **Copy any message:** Hover a bubble to reveal the copy button; click to copy to clipboard
- **Export as JSON:** Downloads the full conversation (messages + metadata) as a formatted JSON file — useful for offline analysis or sharing
- **Metadata sidebar:** Provider, model, message count, session ID, created timestamp

### Lightweight TypeScript SDK

Drop-in wrapper around your existing LLM fetch calls. Zero impact on chat UX.

- **`wrapFetch`** — wraps any non-streaming LLM call
- **`wrapStream`** — wraps SSE streaming calls, captures token deltas and final usage
- **Fire-and-forget:** Logging never blocks or throws; retries 3× with exponential backoff (200ms → 600ms → 1400ms)
- **Client-side PII redaction:** Emails, phone numbers, credit card numbers, Aadhaar IDs, and common name patterns are redacted before the payload leaves the browser
- **UUID-first:** `conversation_id` and `session_id` are generated client-side — no server round-trip needed to start logging

### PII Redaction (Defense in Depth)

Applied at two layers so sensitive data never reaches the database:

| Layer | When | What gets redacted |
|-------|------|--------------------|
| SDK (client) | Before the log payload leaves the browser | Input/output previews |
| Ingestion API (server) | On receipt, before database write | Input/output previews |

Patterns redacted: email addresses, phone numbers, credit/debit card numbers, Aadhaar IDs, common name prefixes (Mr/Mrs/Dr + surname).

### Dark / Light Theme

Full dual-theme UI with a toggle switch in the top bar. Preference persists across sessions in localStorage. Every color — text, backgrounds, borders, chart ticks, inputs, placeholders — adapts via CSS custom properties.

### Event-Based Architecture

Inference events flow through Redis pub/sub so the dashboard live feed updates in real time without polling:

```
SDK → POST /api/ingest/log → PostgreSQL (durable store)
                           → Redis PUBLISH inference_events
                           → WebSocket /ws/logs → Browser live feed
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Browser  (port 3000)                          │
│                                                                      │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │  Dashboard  │  │  Conversations   │  │   Chat  /chat        │   │
│  │  Live Feed ◄┼──┼── WebSocket      │  │   SDK auto-logging   │   │
│  │  Cost Intel │  │  Detail + Resume │  │   5-provider SSE     │   │
│  └─────────────┘  └──────────────────┘  └──────────────────────┘   │
│                                                                      │
│   Single origin — no CORS, no port juggling                          │
│   /api/*  →  Vite proxy (dev) / nginx (prod)  →  ingestion :8000    │
│   /ws/*   →  Vite proxy (dev) / nginx (prod)  →  ingestion :8000    │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │      Ingestion API          │   :8000  (internal)
              │   FastAPI + asyncpg         │
              │                            │
              │  POST /api/ingest/log       │◄── SDK (fire-and-forget)
              │  GET  /api/conversations    │
              │  GET  /api/metrics/summary  │
              │  GET  /api/metrics/cost     │
              │  GET  /api/metrics/timeseries│
              │  WS   /ws/logs ─────────────┼──► Redis pub/sub
              └─────────────┬──────────────┘    (inference_events)
                            │
                ┌───────────▼────────────┐
                │       PostgreSQL        │
                │   conversations         │
                │   messages              │
                │   inference_logs        │
                └────────────────────────┘
```

### Ingestion Flow

1. SDK wraps the LLM call, starts a timer
2. LLM responds (streaming or not); SDK captures token counts from the response
3. SDK constructs the log payload and fires `POST /api/ingest/log` — non-blocking
4. Ingestion API validates with Pydantic v2, applies server-side PII redaction
5. Writes to PostgreSQL (`inference_logs` + upsert on `conversations` + insert `messages`)
6. Publishes event to Redis `inference_events` channel
7. WebSocket handler forwards the Redis message to all connected browser clients

---

## Project Structure

```
llm-inference-observatory/
│
├── dev.sh                          # One-command local start (Docker + Python + Node)
├── docker-compose.yml              # Full stack: postgres + redis + ingestion + frontend
├── Makefile                        # Convenience targets
│
├── ingestion/                      # FastAPI backend
│   ├── app/
│   │   ├── main.py                 # App entrypoint, lifespan, CORS config
│   │   ├── database.py             # Async SQLAlchemy engine + session factory
│   │   ├── schemas.py              # Pydantic v2 request/response models
│   │   ├── redis_client.py         # Redis pub/sub publisher
│   │   ├── models/models.py        # Conversation, Message, InferenceLog ORM models
│   │   ├── routers/
│   │   │   ├── ingest.py           # POST /api/ingest/log
│   │   │   ├── conversations.py    # GET/PATCH /api/conversations
│   │   │   ├── metrics.py          # GET /api/metrics/summary, /timeseries, /cost
│   │   │   └── websocket.py        # WS /ws/logs → Redis subscriber
│   │   └── utils/pii_redactor.py   # Server-side regex PII redaction
│   ├── alembic/
│   │   └── versions/001_initial_schema.py
│   ├── entrypoint.sh               # Runs migrations then starts uvicorn
│   ├── requirements.txt
│   └── Dockerfile
│
├── sdk/                            # @observatory/sdk  (TypeScript, npm file: link)
│   └── src/
│       ├── observatory.ts          # LLMObservatory — wrapFetch + wrapStream
│       ├── types.ts                # Shared interfaces
│       ├── pii.ts                  # Client-side PII redaction
│       └── index.ts                # Package exports
│
├── frontend/                       # React 18 + Vite + TailwindCSS v3
│   ├── index.html                  # App shell, favicon, Google Fonts
│   ├── nginx.conf                  # Production nginx: serves SPA + proxies /api, /ws
│   ├── Dockerfile                  # Multi-stage: Node build → nginx serve
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.tsx       # Metrics cards, charts, cost intelligence, live feed
│       │   ├── Conversations.tsx   # Searchable conversation list
│       │   ├── ConversationDetail.tsx  # Full history, resume, export JSON
│       │   └── Chat.tsx            # New multi-provider chat with streaming
│       ├── components/
│       │   ├── MetricCard.tsx      # Animated count-up card
│       │   ├── Sidebar.tsx         # Navigation sidebar
│       │   ├── TopBar.tsx          # Theme toggle + page title
│       │   ├── StatusBadge.tsx     # active / cancelled / completed pill
│       │   ├── LatencyBadge.tsx    # Color-coded latency chip
│       │   ├── CopyButton.tsx      # Hover-reveal clipboard button
│       │   ├── SettingsModal.tsx   # API key management modal
│       │   └── Skeleton.tsx        # Loading skeletons
│       ├── services/
│       │   ├── api.ts              # Typed REST client for all endpoints
│       │   └── llm.ts              # 5-provider LLM caller with SSE streaming
│       ├── hooks/
│       │   ├── useCountUp.ts       # Smooth animated number transitions
│       │   └── useWebSocket.ts     # Auto-reconnecting WebSocket hook
│       └── store/
│           └── index.ts            # Zustand store: theme, API keys, live events, toasts
│
└── k8s/                            # Kubernetes manifests
    ├── frontend-deployment.yaml
    ├── ingestion-deployment.yaml
    └── postgres-statefulset.yaml
```

---

## API Reference

All REST responses follow: `{ success: bool, data: T, error: string | null }`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ingest/log` | Receive and store an inference log from the SDK |
| `GET`  | `/api/conversations` | List all conversations, ordered by `updated_at` desc |
| `GET`  | `/api/conversations/:id` | Conversation metadata + full message history |
| `GET`  | `/api/conversations/:id/messages` | Messages only for a conversation |
| `PATCH`| `/api/conversations/:id/cancel` | Set conversation status to `cancelled` |
| `GET`  | `/api/metrics/summary` | Aggregates: token totals, avg latency, error rate, p50/p95/p99 |
| `GET`  | `/api/metrics/timeseries` | Time-bucketed data (`?metric=latency\|tokens\|errors&interval=1h\|6h\|24h\|7d`) |
| `GET`  | `/api/metrics/cost` | Estimated dollar spend per model, projected monthly, insight recommendations |
| `WS`   | `/ws/logs` | Real-time inference event stream via Redis pub/sub |
| `GET`  | `/health` | Health check — returns `{ status: "ok" }` |

---

## SDK Usage

```typescript
import { LLMObservatory } from "@observatory/sdk";

const obs = new LLMObservatory({
  ingestionEndpoint: "",           // empty → relative URL, goes through proxy
  enablePIIRedaction: true,        // redacts emails, phones, cards client-side
  onError: (err) => console.warn(err),  // never throws, never blocks chat
});

// ── Non-streaming call ────────────────────────────────────────────────
const response = await obs.wrapFetch({
  conversationId: "conv-uuid",     // assign once per conversation, reuse across turns
  sessionId:      "session-uuid",
  provider:       "openai",
  model:          "gpt-4.1",
  messages:       [{ role: "user", content: "Hello!" }],
  fetchFn: () =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4.1", messages }),
    }),
});

// ── Streaming call ────────────────────────────────────────────────────
// Captures token delta text and usage from the final SSE chunk
const response = await obs.wrapStream({
  conversationId, sessionId,
  provider: "anthropic",
  model:    "claude-sonnet-4-5",
  messages,
  fetchFn:  () => anthropicStreamCall(),
  onChunk:  (text) => appendToUI(text),
});
```

**Supported providers:** `openai` · `anthropic` · `google` · `deepseek` · `grok`

---

## Schema Design Decisions

### UUID Primary Keys

UUIDs are generated client-side in the SDK before the server sees the request. This enables:
- Fire-and-forget logging with no server round-trip to get an ID
- Idempotent retries — sending the same `log_id` twice is a no-op
- The SDK manages `conversation_id` across turns with zero coordination overhead

### `inference_logs` Separate from `messages`

One message turn ≠ one inference event. Keeping them in separate tables means:
- Metrics queries scan only `inference_logs` (narrow, indexed) without touching message content
- Message content can be archived or purged independently of telemetry data
- One conversation can span multiple providers and models across turns

### `content_preview` Instead of Full Content

- Caps storage at 200 characters per field
- Applied after PII redaction — sensitive data never reaches the database
- Short strings are cheaper for index scans and dashboard list queries

### Indexing Strategy

```sql
INDEX conversations(updated_at DESC)              -- conversation list, hot path
INDEX conversations(session_id)                   -- SDK session grouping
INDEX messages(conversation_id, sequence_number)  -- ordered message render
INDEX inference_logs(request_timestamp)           -- time-range metrics queries
INDEX inference_logs(provider)                    -- provider breakdown aggregations
INDEX inference_logs(conversation_id)             -- join to conversations
```

---

## Tradeoffs Made

| Decision | Choice | Alternative | Reason |
|----------|--------|-------------|--------|
| Database | PostgreSQL | SQLite | ENUM types, `DATE_TRUNC`, async `asyncpg`, concurrent writes |
| Logging style | Fire-and-forget + 3× retry | Blocking | Zero added latency to the user's chat experience |
| Message queue | Redis pub/sub | Kafka | Far simpler ops; adequate below ~10k events/s |
| PII redaction | Client + server (both) | Server only | Defense in depth; client redaction protects the network transit leg |
| Single URL | Vite proxy → ingestion | CORS + two ports | No CORS config needed; consistent WebSocket origin |
| Token tracking | Best-effort from SSE | Always accurate | Streaming APIs don't always emit `usage`; logging must never block chat |
| Cost estimates | Blended public rate cards | Live pricing API | No external dependency, no API key needed, transparent approximation |

---

## Scaling Considerations

### Ingestion (stateless → scale horizontally)

Each ingestion pod is independent. For WebSocket fan-out across multiple pods, switch from Redis pub/sub to Redis Streams (`XADD` / `XREAD`), or use sticky sessions (IP hash) on the load balancer.

### PostgreSQL

- Add read replicas for metrics and cost queries — these are read-heavy and can lag behind writes
- Partition `inference_logs` by month once the table exceeds ~50M rows
- Connection pool is capped at 20 per ingestion pod (`database.py`)

### Redis

- Switch to Redis Cluster when pub/sub throughput exceeds ~100k messages/s

### Frontend

Deploy as a static build (`npm run build`) to any CDN. Vite output is content-hashed so assets get long-lived `Cache-Control: immutable` headers. The `frontend/nginx.conf` handles API and WebSocket proxying in production Docker / k8s.

---

## Failure Handling

| Component | Failure | Behavior |
|-----------|---------|----------|
| SDK → Ingestion | Network error or non-2xx | Retries 3× with 200 → 600 → 1400ms backoff, then calls `onError` and drops silently |
| Ingestion → PostgreSQL | Connection error | Pool retries; transaction rolls back; returns HTTP 500 |
| Ingestion → Redis | Pub/sub publish fails | Event dropped from live feed; database write still succeeds |
| WebSocket client | Connection drops | Auto-reconnects after 3s, indefinitely |
| PostgreSQL pool | All connections exhausted | HTTP 503 after timeout; pool max is 20 per pod |
| Malformed payload | Schema validation fails | FastAPI returns HTTP 422 with field-level error details |
| LLM provider | API error during chat | SDK logs `status=error` and `error_message`; chat UI shows a toast; never crashes |

---

## What I'd Improve With More Time

- **ClickHouse** for time-series metrics at scale — PostgreSQL `DATE_TRUNC` starts to struggle past ~100M rows
- **Kafka / Redpanda** for guaranteed event delivery and consumer replay (pub/sub drops events on subscriber lag)
- **OpenTelemetry** integration — correlate LLM latency with upstream service traces using trace IDs
- **Alerting** — latency spike or error rate threshold notifications via PagerDuty or Slack webhooks
- **CSV / Parquet export** — download raw inference logs for offline analysis in Python or SQL tools
- **Rate limiting** on `/api/ingest/log` — protect against SDK misconfiguration flooding the ingestion service
- **Multi-tenant auth** — per-project API keys for shared deployments
- **Prompt regression testing** — save golden conversations, replay against new models, diff the outputs
- **Auto `stream_options.include_usage`** injected by the SDK for all OpenAI-compatible providers
