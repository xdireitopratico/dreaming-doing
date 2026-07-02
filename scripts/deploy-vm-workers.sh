#!/usr/bin/env bash
# Deploy Redis + Inngest connect workers na VM Hostinger.
#
# Uso:
#   ./scripts/deploy-vm-workers.sh
#   ./scripts/deploy-vm-workers.sh --vm-id 1484367
#   ./scripts/deploy-vm-workers.sh --host 187.77.239.8 --dry-run
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VM_ID=""
VM_HOST=""
SSH_USER="root"
DRY_RUN=0
REMOTE_DIR="/opt/dreaming-doing"

for arg in "$@"; do
  case "$arg" in
    --vm-id=*) VM_ID="${arg#*=}" ;;
    --vm-id) shift; VM_ID="${1:-}" ;;
    --host=*) VM_HOST="${arg#*=}" ;;
    --host) shift; VM_HOST="${1:-}" ;;
    --user=*) SSH_USER="${arg#*=}" ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
  esac
done

while IFS='=' read -r key value; do
  export "$key=$value"
done < <(node "$ROOT/scripts/load-env-for-deploy.mjs")

if [[ -z "$VM_HOST" ]]; then
  if [[ -n "$VM_ID" ]]; then
    VM_HOST="$(node scripts/hostinger-vps.mjs "$VM_ID" | awk '{for(i=1;i<=NF;i++) if($i ~ /^ipv4=/) print substr($i,6)}' | head -1)"
  elif [[ -n "${HOSTINGER_VM_ID:-}" ]]; then
    VM_HOST="$(node scripts/hostinger-vps.mjs "$HOSTINGER_VM_ID" | awk '{for(i=1;i<=NF;i++) if($i ~ /^ipv4=/) print substr($i,6)}' | head -1)"
  else
    VM_HOST="$(node scripts/hostinger-vps.mjs | awk '{for(i=1;i<=NF;i++) if($i ~ /^ipv4=/) print substr($i,6)}' | head -1)"
  fi
fi

if [[ -z "$VM_HOST" || "$VM_HOST" == "?" ]]; then
  echo "Não foi possível resolver IP da VM (use --host ou HOSTINGER_VM_ID)" >&2
  exit 1
fi

: "${SUPABASE_URL:?SUPABASE_URL obrigatório}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY obrigatório}"
: "${INNGEST_SIGNING_KEY:?INNGEST_SIGNING_KEY obrigatório}"
: "${INNGEST_EVENT_KEY:?INNGEST_EVENT_KEY obrigatório}"

APP_VERSION="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo dev)"
ENV_FILE="$ROOT/infra/vm/.env"

mkdir -p "$(dirname "$ENV_FILE")"
cat >"$ENV_FILE" <<EOF
NODE_ENV=production
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
INNGEST_SIGNING_KEY=$INNGEST_SIGNING_KEY
INNGEST_EVENT_KEY=$INNGEST_EVENT_KEY
INNGEST_APP_VERSION=$APP_VERSION
REDIS_URL=redis://redis:6379/0
EOF
chmod 600 "$ENV_FILE"

echo "=== Deploy dreaming-doing workers ==="
echo "host: $SSH_USER@$VM_HOST"
echo "version: $APP_VERSION"
echo "remote: $REMOTE_DIR"

echo "→ build worker bundle (local)"
npm run build:connect-worker

RSYNC_EXCLUDES=(
  --exclude node_modules
  --exclude dist/client
  --exclude .git
  --exclude infra/vm/.env
)

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] rsync + docker compose up"
  exit 0
fi

echo "→ sync repo"
rsync -az --delete "${RSYNC_EXCLUDES[@]}" "$ROOT/" "$SSH_USER@$VM_HOST:$REMOTE_DIR/"

echo "→ upload runtime .env"
scp -q "$ENV_FILE" "$SSH_USER@$VM_HOST:$REMOTE_DIR/infra/vm/.env"

echo "→ docker compose build + up"
ssh "$SSH_USER@$VM_HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR/infra/vm"
docker compose build --pull
docker compose up -d
docker compose ps
REMOTE

echo "→ health"
for port in 8081 8082; do
  if ssh "$SSH_USER@$VM_HOST" "wget -qO- http://127.0.0.1:$port/ready" >/dev/null 2>&1; then
    echo "  ✓ worker :$port ready"
  else
    echo "  ✗ worker :$port not ready (ver logs: docker logs dp-dd-inngest-worker)" >&2
  fi
done

echo "✓ Deploy concluído — workers Inngest connect em $VM_HOST (8081, 8082)"