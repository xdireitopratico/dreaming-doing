#!/usr/bin/env bash
# Validação rápida da infra do agente (Edge + DB).
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-dpduljngdurfpmaclffa}"
BASE="https://${REF}.supabase.co/functions/v1"
TOKEN_FILE="${SUPABASE_ACCESS_TOKEN_FILE:-$HOME/.supabase/access-token}"

echo "→ health smoke"
curl -sf "${BASE}/health" | grep -q '"ok"'

echo "→ agent-run auth gate"
AUTH_BODY=$(curl -s -X POST "${BASE}/agent-run" -H "Content-Type: application/json" -d '{}')
echo "$AUTH_BODY" | grep -q 'Não autenticado'

if [[ -f "$TOKEN_FILE" ]]; then
  API_TOKEN=$(cat "$TOKEN_FILE")
  echo "→ tabelas agent_*"
  curl -sf "https://api.supabase.com/v1/projects/${REF}/database/query" \
    -H "Authorization: Bearer ${API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"query":"select count(*)::int as n from agent_stream_events"}' | grep -q '"n"'
fi

echo "→ vitest agent-progress"
npm test -- --run src/hooks/useSSE.test.ts >/dev/null

echo "✓ Infra do agente OK"