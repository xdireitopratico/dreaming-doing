#!/usr/bin/env bash
# Consulta logs do Supabase (function_logs) via Management API.
# Uso: ./scripts/sync/supabase-logs.sh "select datetime(timestamp) as ts, event_message from function_logs order by timestamp desc limit 20"
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-dpduljngdurfpmaclffa}"
TOKEN_FILE="${SUPABASE_ACCESS_TOKEN_FILE:-$HOME/.supabase/access-token}"
HOURS="${SUPABASE_LOG_HOURS:-24}"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Token não encontrado em $TOKEN_FILE (rode: supabase login)" >&2
  exit 1
fi

SQL="${1:-select datetime(timestamp) as ts, event_message from function_logs order by timestamp desc limit 30}"
TOKEN=$(cat "$TOKEN_FILE")
START=$(date -u -d "${HOURS} hours ago" +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)

curl -sS -G "https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/logs.all" \
  --data-urlencode "iso_timestamp_start=${START}" \
  --data-urlencode "iso_timestamp_end=${END}" \
  --data-urlencode "sql=${SQL}" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool