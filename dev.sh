#!/usr/bin/env bash
# Re-exec with bash if invoked via sh/dash
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi
set -euo pipefail

# ── colours ──────────────────────────────────────────────────────────
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[obs]${RESET} $*"; }
ok()   { echo -e "${GREEN}[ok]${RESET}  $*"; }
warn() { echo -e "${YELLOW}[!]${RESET}   $*"; }
die()  { echo -e "${RED}[err]${RESET} $*"; exit 1; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDS=()

# ── cleanup on Ctrl-C / exit ─────────────────────────────────────────
cleanup() {
  echo ""
  log "Shutting down…"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  ok "All services stopped. Goodbye."
}
trap cleanup EXIT INT TERM

# ── banner ────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║           InferIQ  v1.0               ║"
echo "  ║   LLM Inference Intelligence          ║"
echo "  ╚═══════════════════════════════════════╝${RESET}"
echo ""

# ── 1. check docker ───────────────────────────────────────────────────
log "Checking Docker…"

# Install Docker if not found
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker not found. Installing Docker Engine…"
  if ! command -v curl >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq curl
  fi
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh >/dev/null 2>&1
  rm -f /tmp/get-docker.sh
  sudo systemctl enable docker >/dev/null 2>&1 || true
  # Add current user to docker group so future runs don't need sudo
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  ok "Docker installed"
fi

# Start Docker daemon if not running
if ! docker info >/dev/null 2>&1; then
  warn "Docker daemon is not running. Attempting to start…"
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start docker
  elif command -v service >/dev/null 2>&1; then
    sudo service docker start
  else
    die "Could not start Docker daemon. Please start it manually."
  fi
  # Wait up to 15s for daemon to be ready
  for i in $(seq 1 15); do
    docker info >/dev/null 2>&1 && break
    [ "$i" -eq 15 ] && die "Docker daemon did not start in time. Try: sudo systemctl start docker"
    sleep 1
  done
  ok "Docker daemon started"
fi

ok "Docker is running"

# ── 2. postgresql ────────────────────────────────────────────────────
log "Starting PostgreSQL…"
if docker ps --format '{{.Names}}' | grep -q "^obs-postgres$"; then
  ok "PostgreSQL already running"
elif docker ps -a --format '{{.Names}}' | grep -q "^obs-postgres$"; then
  docker start obs-postgres >/dev/null
  ok "PostgreSQL container restarted"
else
  # Free port 5432 if something else is using it
  if ss -tlnp 2>/dev/null | grep -q ':5432' || fuser 5432/tcp >/dev/null 2>&1; then
    warn "Port 5432 is in use. Stopping the process occupying it…"
    sudo fuser -k 5432/tcp 2>/dev/null || true
    sleep 1
  fi
  docker run -d --name obs-postgres \
    -e POSTGRES_DB=observatory \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -p 5433:5432 \
    postgres:16-alpine >/dev/null
  ok "PostgreSQL container created and started"
fi

# ── 3. redis ─────────────────────────────────────────────────────────
log "Starting Redis…"
if docker ps --format '{{.Names}}' | grep -q "^obs-redis$"; then
  ok "Redis already running"
elif docker ps -a --format '{{.Names}}' | grep -q "^obs-redis$"; then
  docker start obs-redis >/dev/null
  ok "Redis container restarted"
else
  # Free port 6379 if something else is using it
  if ss -tlnp 2>/dev/null | grep -q ':6379' || fuser 6379/tcp >/dev/null 2>&1; then
    warn "Port 6379 is in use. Stopping the process occupying it…"
    sudo fuser -k 6379/tcp 2>/dev/null || true
    sleep 1
  fi
  docker run -d --name obs-redis \
    -p 6379:6379 \
    redis:7-alpine >/dev/null
  ok "Redis container created and started"
fi

# ── 4. wait for postgres to be ready ─────────────────────────────────
log "Waiting for PostgreSQL to be ready…"
for i in $(seq 1 30); do
  if docker exec obs-postgres pg_isready -U postgres -q 2>/dev/null; then
    ok "PostgreSQL is accepting connections"
    break
  fi
  [ "$i" -eq 30 ] && die "PostgreSQL did not become ready in time"
  sleep 1
done

# ── 5. node / nvm ────────────────────────────────────────────────────
log "Checking Node.js…"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" --silent

NODE_VER=$(node --version 2>/dev/null || echo "none")
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/' 2>/dev/null || echo "0")

if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  warn "Node $NODE_VER is too old. Trying nvm to switch to Node 20…"
  nvm use 20 --silent 2>/dev/null || nvm install 20 --silent 2>/dev/null || \
    die "Node 18+ required. Install via https://nodejs.org or nvm."
fi
ok "Node $(node --version)"

# ── 6. build sdk ─────────────────────────────────────────────────────
log "Building @observatory/sdk…"
cd "$REPO/sdk"
if [ ! -d node_modules ]; then
  npm install --silent
fi
# rebuild only if source is newer than dist
if [ ! -f dist/index.js ] || \
   find src -newer dist/index.js | grep -q .; then
  npm run build 2>&1 | grep -E "(success|error|Error)" || true
  ok "SDK built"
else
  ok "SDK up to date — skipping rebuild"
fi

# ── 7. frontend deps ─────────────────────────────────────────────────
log "Installing frontend dependencies…"
cd "$REPO/frontend"
if [ ! -d node_modules ]; then
  npm install --silent
  ok "Frontend dependencies installed"
else
  ok "Frontend node_modules present — skipping install"
fi

# ── 8. python venv + ingestion deps ──────────────────────────────────
log "Setting up Python environment…"
cd "$REPO/ingestion"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  ok "Created Python venv"
fi
source .venv/bin/activate

# install only if requirements changed
REQS_HASH_FILE=".venv/.reqs_hash"
REQS_HASH=$(md5sum requirements.txt 2>/dev/null | cut -d' ' -f1 || md5 -q requirements.txt 2>/dev/null || echo "")
PREV_HASH=$(cat "$REQS_HASH_FILE" 2>/dev/null || echo "")

VENV_BIN="$REPO/ingestion/.venv/bin"

if [ "$REQS_HASH" != "$PREV_HASH" ]; then
  log "Installing Python dependencies…"
  "$VENV_BIN/pip" install -q -r requirements.txt
  echo "$REQS_HASH" > "$REQS_HASH_FILE"
  ok "Python dependencies installed"
else
  # Force install if uvicorn is missing (e.g. venv existed but install was skipped)
  if [ ! -f "$VENV_BIN/uvicorn" ]; then
    log "uvicorn missing — installing Python dependencies…"
    "$VENV_BIN/pip" install -q -r requirements.txt
    echo "$REQS_HASH" > "$REQS_HASH_FILE"
    ok "Python dependencies installed"
  else
    ok "Python dependencies up to date — skipping install"
  fi
fi

# ── 9. run migrations ────────────────────────────────────────────────
log "Running database migrations…"
DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5433/observatory" \
  "$VENV_BIN/alembic" upgrade head 2>&1 | grep -E "(Running|INFO.*upgrade|already)" || true
ok "Migrations applied"

# ── 10. start ingestion ───────────────────────────────────────────────
log "Starting ingestion service on :8000…"
# Kill any stale process on port 8000 so the new code always loads
fuser -k 8000/tcp 2>/dev/null || true
sleep 0.5
DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5433/observatory" \
REDIS_URL="redis://localhost:6379" \
  "$VENV_BIN/uvicorn" app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level warning \
  > "$REPO/.ingestion.log" 2>&1 &
PIDS+=($!)
INGESTION_PID=$!

# wait for ingestion to be healthy
for i in $(seq 1 20); do
  if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    ok "Ingestion API is up (PID $INGESTION_PID)"
    break
  fi
  [ "$i" -eq 20 ] && {
    warn "Ingestion did not start in time. Last logs:"
    tail -20 "$REPO/.ingestion.log"
    die "Ingestion failed to start"
  }
  sleep 1
done

deactivate

# ── 11. start frontend ────────────────────────────────────────────────
log "Starting frontend dev server on :3000…"
cd "$REPO/frontend"
npm run dev -- --host 0.0.0.0 \
  > "$REPO/.frontend.log" 2>&1 &
PIDS+=($!)
FRONTEND_PID=$!

# wait for vite to be ready
for i in $(seq 1 20); do
  if curl -sf http://localhost:3000 >/dev/null 2>&1; then
    break
  fi
  [ "$i" -eq 20 ] && {
    warn "Frontend did not start in time. Last logs:"
    tail -20 "$REPO/.frontend.log"
    die "Frontend failed to start"
  }
  sleep 1
done

# ── ready ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ✓ All services are running!${RESET}"
echo ""
echo -e "  ${BOLD}App${RESET}          →  ${CYAN}http://localhost:3000${RESET}"
echo -e "  ${BOLD}API docs${RESET}     →  ${CYAN}http://localhost:8000/docs${RESET}"
echo -e "  ${BOLD}Ingestion log${RESET} →  .ingestion.log"
echo -e "  ${BOLD}Frontend log${RESET}  →  .frontend.log"
echo ""
echo -e "  ${YELLOW}Add your LLM API keys via the ⚙ gear icon in the sidebar${RESET}"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop all services."
echo ""

# ── tail logs so the terminal stays useful ────────────────────────────
tail -f "$REPO/.ingestion.log" "$REPO/.frontend.log" 2>/dev/null &
PIDS+=($!)

wait $INGESTION_PID $FRONTEND_PID
