#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== xg1 Dev Environment Setup ==="

# ── 1. Check prerequisites ──────────────────────────────────────────────────
check_version() {
    local name="$1" cmd="$2" pattern="$3" min="$4"
    if ! command -v "$cmd" &>/dev/null; then
        echo "ERROR: $name not found. Please install $name $min+." >&2
        exit 1
    fi
    local ver
    ver=$(eval "$cmd" 2>&1 | grep -oE "$pattern" | head -1)
    echo "  $name: $ver"
}

echo ""
echo "Checking prerequisites..."
check_version "Java 17" "java -version 2>&1 | head -1" '[0-9]+\.[0-9.]+' "17"
check_version "Python 3.11" "python3 --version" '[0-9]+\.[0-9.]+' "3.11"
check_version "Node 18" "node --version" '[0-9]+\.[0-9.]+' "18"
check_version "Docker" "docker --version" '[0-9]+\.[0-9.]+' "20"

# Verify Java 17+
JAVA_VER=$(java -version 2>&1 | grep -oE '"[0-9]+' | grep -oE '[0-9]+' | head -1)
if [ "$JAVA_VER" -lt 17 ]; then
    echo "ERROR: Java 17+ required, found $JAVA_VER" >&2
    exit 1
fi

# Verify Node 18+
NODE_VER=$(node --version | grep -oE '[0-9]+' | head -1)
if [ "$NODE_VER" -lt 18 ]; then
    echo "ERROR: Node 18+ required, found $NODE_VER" >&2
    exit 1
fi

if ! docker info &>/dev/null; then
    echo "ERROR: Docker daemon is not running." >&2
    exit 1
fi

echo "All prerequisites OK."

# ── 2. Copy .env if needed ───────────────────────────────────────────────────
ENV_FILE="$DEPLOY_DIR/.env"
ENV_EXAMPLE="$DEPLOY_DIR/.env.example"
if [ ! -f "$ENV_FILE" ]; then
    echo ""
    echo "Creating $ENV_FILE from .env.example..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "  Done. Edit $ENV_FILE to set real secrets before production use."
else
    echo ""
    echo ".env already exists, skipping copy."
fi

# ── 3. Start infra services ──────────────────────────────────────────────────
echo ""
echo "Starting infrastructure services (postgres, redis, minio)..."
cd "$DEPLOY_DIR"
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis minio

# ── 4. Wait for health checks ────────────────────────────────────────────────
echo ""
echo "Waiting for services to be healthy..."

wait_healthy() {
    local name="$1" container="$2" max_wait=60 elapsed=0
    while [ "$elapsed" -lt "$max_wait" ]; do
        status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")
        if [ "$status" = "healthy" ]; then
            echo "  $name: healthy"
            return 0
        fi
        sleep 3
        elapsed=$((elapsed + 3))
    done
    echo "  WARNING: $name did not become healthy within ${max_wait}s (status: $status)"
}

wait_healthy "postgres" "xg-postgres"
wait_healthy "redis"    "xg-redis"
wait_healthy "minio"    "xg-minio"

# ── 5. Print status and URLs ─────────────────────────────────────────────────
echo ""
echo "=== Service Status ==="
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps postgres redis minio

echo ""
echo "=== URLs ==="
echo "  PostgreSQL : localhost:5432  (db: xg1, user: postgres)"
echo "  Redis      : localhost:6379"
echo "  MinIO API  : http://localhost:9000"
echo "  MinIO UI   : http://localhost:9001  (admin / minioadmin123)"
echo ""
echo "Dev environment ready. Start the backend and AI sidecar natively."
