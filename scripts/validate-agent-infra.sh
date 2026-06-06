#!/usr/bin/env bash
# Validação rápida da infra do agente (Edge + DB + PGMQ).
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-dpduljngdurfpmaclffa}"
BASE="https://${REF}.supabase.co/functions/v1"
TOKEN_FILE="${SUPABASE_ACCESS_TOKEN_FILE:-$HOME/.supabase/access-token}"

echo "→ agent-worker smoke"
curl -sf -X POST "${BASE}/agent-worker" -H "Content-Type: application/json" -d '{"tick":true}' | grep -q '"ok":true'

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

  echo "→ pgmq status"
  PGMQ=$(curl -sf "https://api.supabase.com/v1/projects/${REF}/database/query" \
    -H "Authorization: Bearer ${API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"query":"select extname from pg_extension where extname = '\''pgmq'\''"}')
  if echo "$PGMQ" | grep -q pgmq; then
    echo "  PGMQ: habilitado"
    QUEUES=$(curl -sf "https://api.supabase.com/v1/projects/${REF}/database/query" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"query":"select queue_name from pgmq.meta"}')
    if echo "$QUEUES" | grep -q agent_chunks; then
      echo "  Fila agent_chunks: OK"
    else
      echo "  Fila agent_chunks: ausente — criando…"
      curl -sf "https://api.supabase.com/v1/projects/${REF}/database/query" \
        -H "Authorization: Bearer ${API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{"query":"SELECT pgmq.create('\''agent_chunks'\'');"}' >/dev/null
      echo "  Fila agent_chunks: criada"
    fi
    echo "→ PGMQ send/read smoke"
    curl -sf "https://api.supabase.com/v1/projects/${REF}/database/query" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"query":"SELECT pgmq.send('\''agent_chunks'\'', '\''{\"smoke\":true}'\''::jsonb);"}' | grep -q '"send"'
    curl -sf "https://api.supabase.com/v1/projects/${REF}/database/query" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"query":"SELECT pgmq.delete('\''agent_chunks'\'', (SELECT msg_id FROM pgmq.read('\''agent_chunks'\'', 0, 1) LIMIT 1));"}' >/dev/null
    echo "  PGMQ roundtrip: OK"
  else
    echo "  PGMQ: OFF (usa fallback inline com chunks no servidor)"
  fi
fi

echo "→ vitest useSSE"
npm test -- --run src/hooks/useSSE.test.ts >/dev/null

echo "✓ Infra do agente OK"