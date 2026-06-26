#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# debug-log.sh — Coleta logs de Supabase + Vercel + Inngest em um comando
#
# Uso:
#   ./scripts/debug-log.sh                          # Todos os sources, últimas 6h
#   ./scripts/debug-log.sh --hours 2 --errors-only   # Só erros, últimas 2h
#   ./scripts/debug-log.sh --supabase                # Só Supabase
#   ./scripts/debug-log.sh --json                    # JSON estruturado
#   ./scripts/debug-log.sh --follow                  # Tail mode (repetir)
#   ./scripts/debug-log.sh --run-id UUID             # Telemetria de um run específico
#   ./scripts/debug-log.sh --telemetry-only          # Só agent_streaming_telemetry
#
# Config: variáveis em .env.debug (ver .env.debug.example)
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Cores (desliga se não for terminal) ───
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  CYAN='\033[0;36m'
  GRAY='\033[1;30m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; GRAY=''; BOLD=''; NC=''
fi

# ─── Paths ───
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="${DEBUG_LOG_CONFIG:-$PROJECT_DIR/.env.debug}"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/debug-log"
mkdir -p "$CACHE_DIR"

# ─── Defaults ───
HOURS=6
SHOW_SUPABASE=true
SHOW_VERCEL=true
SHOW_INNGEST=true
OUTPUT_JSON=false
ERRORS_ONLY=false
FOLLOW=false
FOLLOW_INTERVAL=30
SHOW_TELEMETRY=true
RUN_ID=""

# Eventos de telemetria que indicam falha/degradação (ver src/lib/streaming-telemetry.ts)
TELEMETRY_ERROR_EVENTS=(
  "agent.stream_seq_gap"
  "agent.stream_seq_dropped"
  "agent.realtime_channel_error"
  "agent.materialized_shape_mismatch"
  "agent.materialized_release_pending"
  "agent.plan_source_runid_missing"
  "agent.narration_stream_overlap"
  "agent.stale_stream_detected"
  "agent.dual_tab_detected"
  "agent.run_dispatch_failed"
)

# ─── Carrega config ───
load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
    set +a
  fi

  SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
  SUPABASE_PAT="${SUPABASE_PAT:-}"
  SUPABASE_LOG_HOURS="${SUPABASE_LOG_HOURS:-$HOURS}"
  VERCEL_TOKEN="${VERCEL_TOKEN:-}"
  VERCEL_PROJECT="${VERCEL_PROJECT:-}"
  INNGEST_SIGNING_KEY="${INNGEST_SIGNING_KEY:-}"
  INNGEST_API_KEY="${INNGEST_API_KEY:-}"

  # REST (PostgREST) — telemetria em agent_streaming_telemetry
  SUPABASE_URL="${SUPABASE_URL:-}"
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
  if [[ (-z "$SUPABASE_URL" || -z "$SUPABASE_SERVICE_ROLE_KEY") && -f "$PROJECT_DIR/.env.local" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$PROJECT_DIR/.env.local"
    set +a
    SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
  fi
}

telemetry_is_error_event() {
  local name=$1
  local evt
  for evt in "${TELEMETRY_ERROR_EVENTS[@]}"; do
    [[ "$evt" == "$name" ]] && return 0
  done
  return 1
}

# ─── Utilitários ───
now_ms() {
  if [[ "$(uname)" == "Darwin" ]]; then
    perl -MTime::HiRes -e 'printf "%.0f\n", Time::HiRes::time() * 1000'
  else
    date +%s%3N
  fi
}

iso_timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%S.000Z"
}

# Converte Unix ms → ISO 8601
ms_to_iso() {
  local ms=$1
  local sec=$((ms / 1000))
  local msec=$((ms % 1000))
  printf "%s.%03dZ" "$(date -u -d "@$sec" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || \
    date -u -r "$sec" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null)" "$msec"
}

# Log formatado (só em modo texto)
logmsg() {
  local level=$1 source=$2 msg=$3 ts=$4
  local ts_fmt="${ts:-$(now_ms)}"
  if [[ "$OUTPUT_JSON" == "true" ]]; then
    printf '{"timestamp":"%s","level":"%s","source":"%s","message":"%s"}\n' \
      "$ts_fmt" "$level" "$source" "$(printf "%s" "$msg" | sed 's/"/\\"/g')"
  else
    local color=""
    case "$level" in
      ERROR|FATAL|FAILED) color="$RED";;
      WARN|WARNING)       color="$YELLOW";;
      INFO)               color="$GREEN";;
      DEBUG)              color="$GRAY";;
      *)                  color="$NC";;
    esac
    printf "${GRAY}%s${NC} ${color}%-6s${NC} ${CYAN}%-18s${NC} %s\n" \
      "${ts_fmt:0:23}" "$level" "$source" "$msg"
  fi
}

section() {
  local title=$1 count=$2
  if [[ "$OUTPUT_JSON" == "true" ]]; then return; fi
  echo ""
  printf "${BOLD}${CYAN}## %s (%d)${NC}\n" "$title" "$count"
  echo ""
}

summary_line() {
  local label=$1 value=$2
  if [[ "$OUTPUT_JSON" == "true" ]]; then return; fi
  printf "  ${GRAY}%s: ${BOLD}%s${NC}\n" "$label" "$value"
}

output_header() {
  if [[ "$OUTPUT_JSON" == "true" ]]; then
    return
  fi
  echo ""
  echo "  ════════════════════════════════════════════════════════════"
  echo "    DEBUG LOGS · $(iso_timestamp) · ${HOURS}h window"
  echo "  ════════════════════════════════════════════════════════════"
}

output_footer() {
  true
}

# ─── Coletor: Supabase ───
fetch_supabase_logs() {
  local ref="${SUPABASE_PROJECT_REF}"
  local token="${SUPABASE_PAT}"
  if [[ -z "$ref" || -z "$token" ]]; then
    logmsg WARN "supabase" "SKIP: SUPABASE_PROJECT_REF ou SUPABASE_PAT vazio" "$(iso_timestamp)"
    return
  fi

  local start_iso
  start_iso=$(date -u -d "${HOURS} hours ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
              date -u -v "-${HOURS}H" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null)
  local end_iso
  end_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # As colunas reais: timestamp (microssegundos), event_message, metadata (JSON array)
  local sql_fn="select timestamp, event_message, metadata from function_logs where timestamp >= timestamp'${start_iso}' order by timestamp desc limit 50"
  local sql_edge="select timestamp, event_message, metadata from edge_logs where timestamp >= timestamp'${start_iso}' order by timestamp desc limit 30"
  local sql_pg="select timestamp, error_severity, error_message from postgres_logs where timestamp >= timestamp'${start_iso}' and error_severity in ('ERROR','FATAL') order by timestamp desc limit 20"

  local cache_fn="$CACHE_DIR/supabase_function.json"
  local cache_edge="$CACHE_DIR/supabase_edge.json"
  local cache_pg="$CACHE_DIR/supabase_pg.json"

  curl -sf --max-time 15 -G "https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all" \
    --data-urlencode "iso_timestamp_start=${start_iso}" \
    --data-urlencode "iso_timestamp_end=${end_iso}" \
    --data-urlencode "sql=${sql_fn}" \
    -H "Authorization: Bearer ${token}" > "$cache_fn" 2>/dev/null || true

  curl -sf --max-time 15 -G "https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all" \
    --data-urlencode "iso_timestamp_start=${start_iso}" \
    --data-urlencode "iso_timestamp_end=${end_iso}" \
    --data-urlencode "sql=${sql_edge}" \
    -H "Authorization: Bearer ${token}" > "$cache_edge" 2>/dev/null || true

  curl -sf --max-time 15 -G "https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all" \
    --data-urlencode "iso_timestamp_start=${start_iso}" \
    --data-urlencode "iso_timestamp_end=${end_iso}" \
    --data-urlencode "sql=${sql_pg}" \
    -H "Authorization: Bearer ${token}" > "$cache_pg" 2>/dev/null || true

  local count=0
  local entries=""

  # Function logs — level e function_id dentro de metadata[0]
  if [[ -s "$cache_fn" ]]; then
    while IFS=$'\t' read -r ts_usec level fn msg; do
      [[ -z "$ts_usec" ]] && continue
      local ts_ms=$((ts_usec / 1000))
      local ts_iso
      ts_iso=$(ms_to_iso "$ts_ms")
      level=$(echo "$level" | tr 'a-z' 'A-Z')
      [[ "$ERRORS_ONLY" == "true" && "$level" != "ERROR" && "$level" != "FATAL" && "$level" != "WARNING" ]] && continue
      entries+="$ts_iso|$level|fn:$fn|$msg"$'\n'
      count=$((count + 1))
    done < <(jq -r '.result[]? | [.timestamp, (.metadata[0].level // "info"), (.metadata[0].function_id // "-"), .event_message] | @tsv' "$cache_fn" 2>/dev/null || true)
  fi

  # Edge logs (API gateway)
  if [[ -s "$cache_edge" ]]; then
    while IFS=$'\t' read -r ts_usec msg; do
      [[ -z "$ts_usec" ]] && continue
      local ts_ms=$((ts_usec / 1000))
      local ts_iso
      ts_iso=$(ms_to_iso "$ts_ms")
      local msg_short="$(echo "$msg" | head -c 200)"
      local level="INFO"
      echo "$msg" | grep -qiE "error|fail|5[0-9][0-9]" && level="ERROR"
      [[ "$ERRORS_ONLY" == "true" && "$level" != "ERROR" ]] && continue
      entries+="$ts_iso|$level|api-gateway|$msg_short"$'\n'
      count=$((count + 1))
    done < <(jq -r '.result[]? | [.timestamp, .event_message] | @tsv' "$cache_edge" 2>/dev/null || true)
  fi

  # Postgres errors
  if [[ -s "$cache_pg" ]]; then
    while IFS=$'\t' read -r ts_usec sev msg; do
      [[ -z "$ts_usec" ]] && continue
      local ts_ms=$((ts_usec / 1000))
      local ts_iso
      ts_iso=$(ms_to_iso "$ts_ms")
      entries+="$ts_iso|ERROR|postgres|$msg"$'\n'
      count=$((count + 1))
    done < <(jq -r '.result[]? | [.timestamp, .error_severity, .error_message] | @tsv' "$cache_pg" 2>/dev/null || true)
  fi

  rm -f "$cache_fn" "$cache_edge" "$cache_pg" 2>/dev/null || true

  if [[ "$count" -eq 0 ]]; then
    logmsg INFO "supabase" "Nenhum log no período" "$(iso_timestamp)"
    return
  fi

  section "SUPABASE" "$count"
  echo "$entries" | sort | while IFS='|' read -r ts level source msg; do
    [[ -z "$ts" ]] && continue
    logmsg "$level" "supabase/$source" "$msg" "$ts"
  done
}

# ─── Coletor: Streaming Telemetry (PostgREST) ───
fetch_telemetry_logs() {
  local url="${SUPABASE_URL}"
  local key="${SUPABASE_SERVICE_ROLE_KEY}"
  if [[ -z "$url" || -z "$key" ]]; then
    logmsg WARN "telemetry" "SKIP: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY vazio (.env.debug ou .env.local)" "$(iso_timestamp)"
    return
  fi

  local start_iso
  start_iso=$(date -u -d "${HOURS} hours ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
              date -u -v "-${HOURS}H" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null)

  local cache="$CACHE_DIR/supabase_telemetry.json"

  curl -sf --max-time 15 -G "${url}/rest/v1/agent_streaming_telemetry" \
    --data-urlencode "select=created_at,event_name,run_id,project_id,payload" \
    --data-urlencode "order=created_at.desc" \
    --data-urlencode "limit=100" \
    --data-urlencode "created_at=gte.${start_iso}" \
    $( [[ -n "$RUN_ID" ]] && printf -- "--data-urlencode run_id=eq.%s" "$RUN_ID" ) \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" > "$cache" 2>/dev/null || true

  local count=0
  local entries=""

  if [[ -s "$cache" ]]; then
    while IFS= read -r row; do
      [[ -z "$row" ]] && continue
      local ts name run_id project_id payload_short
      ts=$(jq -r '.created_at // empty' <<<"$row")
      name=$(jq -r '.event_name // empty' <<<"$row")
      run_id=$(jq -r '.run_id // ""' <<<"$row")
      project_id=$(jq -r '.project_id // ""' <<<"$row")
      payload_short=$(jq -c '.payload // {}' <<<"$row" 2>/dev/null | head -c 180)
      [[ -z "$ts" || -z "$name" ]] && continue
      if [[ "$ERRORS_ONLY" == "true" ]] && ! telemetry_is_error_event "$name"; then
        continue
      fi
      local level="INFO"
      if telemetry_is_error_event "$name"; then
        level="ERROR"
      fi
      local run_short="${run_id:0:8}"
      [[ -z "$run_short" ]] && run_short="-"
      local project_short="${project_id:0:8}"
      [[ -z "$project_short" ]] && project_short="-"
      local msg="${name} run=${run_short} project=${project_short} ${payload_short}"
      entries+="$ts|$level|telemetry|$msg"$'\n'
      count=$((count + 1))
    done < <(jq -c '.[]?' "$cache" 2>/dev/null || true)
  fi

  rm -f "$cache" 2>/dev/null || true

  if [[ "$count" -eq 0 ]]; then
    local hint="Nenhum evento no período"
    [[ -n "$RUN_ID" ]] && hint+=" (run_id=${RUN_ID})"
    [[ "$ERRORS_ONLY" == "true" ]] && hint+=" (modo --errors-only: só eventos de degradação)"
    logmsg INFO "telemetry" "$hint" "$(iso_timestamp)"
    return
  fi

  section "TELEMETRY" "$count"
  echo "$entries" | sort | while IFS='|' read -r ts level source msg; do
    [[ -z "$ts" ]] && continue
    logmsg "$level" "$source" "$msg" "$ts"
  done
}

# ─── Coletor: Vercel ───
fetch_vercel_logs() {
  local token="${VERCEL_TOKEN}"
  local project="${VERCEL_PROJECT}"
  if [[ -z "$token" || -z "$project" ]]; then
    logmsg WARN "vercel" "SKIP: VERCEL_TOKEN ou VERCEL_PROJECT vazio" "$(iso_timestamp)"
    return
  fi

  # 1. Lista deployments recentes
  local deploys_cache="$CACHE_DIR/vercel_deploys.json"
  curl -sf --max-time 15 "https://api.vercel.com/v6/deployments?limit=5&project=${project}" \
    -H "Authorization: Bearer ${token}" > "$deploys_cache" 2>/dev/null || true

  local count=0
  local entries=""

  if [[ -s "$deploys_cache" ]]; then
    # Parse deployments
    while IFS=$'\t' read -r deploy_id created_at state name; do
      [[ -z "$deploy_id" ]] && continue
      local ts_iso
      ts_iso=$(ms_to_iso "$created_at")
      local msg="Deploy ${name:-$deploy_id}: ${state}"
      local level="INFO"
      [[ "$state" == "ERROR" || "$state" == "FAILED" ]] && level="ERROR"
      [[ "$state" == "BUILDING" || "$state" == "QUEUED" ]] && level="DEBUG"
      [[ "$ERRORS_ONLY" == "true" && "$level" != "ERROR" ]] && continue
      entries+="$ts_iso|$level|deploy:$deploy_id|$msg"$'\n'
      count=$((count + 1))

      # 2. Busca eventos do deployment (build logs)
      local events_cache="$CACHE_DIR/vercel_events_${deploy_id}.json"
      curl -sf --max-time 10 "https://api.vercel.com/v2/deployments/${deploy_id}/events" \
        -H "Authorization: Bearer ${token}" > "$events_cache" 2>/dev/null || true

      if [[ -s "$events_cache" ]]; then
        while IFS=$'\t' read -r evt_ts evt_sev evt_msg; do
          [[ -z "$evt_ts" ]] && continue
          evt_msg="$(echo "$evt_msg" | xargs)"
          [[ -z "$evt_msg" ]] && continue
          local evt_iso
          evt_iso=$(ms_to_iso "$evt_ts")
          local evt_level="${evt_sev:-INFO}"
          [[ "$ERRORS_ONLY" == "true" && "$evt_level" != "error" && "$evt_level" != "Error" && "$evt_level" != "ERROR" ]] && continue
          evt_level=$(echo "$evt_level" | tr '[:lower:]' '[:upper:]')
          entries+="$evt_iso|$evt_level|build:$deploy_id|$evt_msg"$'\n'
          count=$((count + 1))
        done < <(jq -r '.[]? | [.created, .severity, .text] | @tsv' "$events_cache" 2>/dev/null || true)
      fi
      rm -f "$events_cache" 2>/dev/null || true
    done < <(jq -r '.deployments[]? | [.uid, .createdAt, .state, .name // "-"] | @tsv' "$deploys_cache" 2>/dev/null || true)
  fi

  rm -f "$deploys_cache" 2>/dev/null || true

  if [[ "$count" -eq 0 ]]; then
    logmsg INFO "vercel" "Nenhum deploy no período (ou token inválido)" "$(iso_timestamp)"
    return
  fi

  section "VERCEL" "$count"
  echo "$entries" | sort | while IFS='|' read -r ts level source msg; do
    [[ -z "$ts" ]] && continue
    logmsg "$level" "vercel/$source" "$msg" "$ts"
  done
}

# ─── Coletor: Inngest ───
fetch_inngest_logs() {
  local key="${INNGEST_API_KEY:-${INNGEST_SIGNING_KEY:-}}"
  if [[ -z "$key" ]]; then
    logmsg WARN "inngest" "SKIP: INNGEST_API_KEY (ou SIGNING_KEY) vazio — preencha .env.debug" "$(iso_timestamp)"
    return
  fi

  local start_iso
  start_iso=$(date -u -d "${HOURS} hours ago" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
              date -u -v "-${HOURS}H" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null)

  local cache="$CACHE_DIR/inngest_events.json"
  # Eventos de ciclo de vida de função (inngest/function.*) carregam status real (Completed/Failed/...)
  # e, em falha, a mensagem/stack do erro. Substitui o antigo /v1/runs (404 hoje; env_id não existe mais).
  curl -sf --max-time 20 "https://api.inngest.com/v1/events?limit=${INNGEST_LIMIT:-100}" \
    -H "Authorization: Bearer ${key}" > "$cache" 2>/dev/null || true

  local count=0
  local entries=""
  if [[ -s "$cache" ]]; then
    while IFS=$'\t' read -r ts fn status run_id err; do
      [[ -z "$ts" || "$ts" == "null" ]] && continue
      # Filtro de janela temporal (ISO 8601 UTC ordena lexicograficamente).
      [[ "$ts" < "$start_iso" ]] && continue
      local level="INFO"
      case "$status" in
        Failed|Cancelled) level="ERROR";;
        Running) level="DEBUG";;
      esac
      [[ "$ERRORS_ONLY" == "true" && "$level" != "ERROR" ]] && continue
      local msg="Run ${fn:-?} (${run_id:-?}): ${status}"
      [[ -n "$err" ]] && msg+=" — ${err}"
      entries+="$ts|$level|${fn:-run}|$msg"$'\n'
      count=$((count + 1))
    done < <(jq -r '
      [.data[]? | select(.name | startswith("inngest/function."))]
      | unique_by(.data.run_id // .id)
      | sort_by(.received_at)
      | .[]
      | [.received_at, (.data.function_id // "-"), (.data._inngest.status // "-"), (.data.run_id // "-"), ((.data.error.message // "") | gsub("\n";" "))]
      | @tsv' "$cache" 2>/dev/null || true)
  fi

  rm -f "$cache" 2>/dev/null || true

  if [[ "$count" -gt 0 ]]; then
    section "INNGEST" "$count"
    echo "$entries" | sort | while IFS='|' read -r ts level source msg; do
      [[ -z "$ts" ]] && continue
      logmsg "$level" "inngest/$source" "$msg" "$ts"
    done
  else
    logmsg INFO "inngest" "Nenhuma run no período" "$(iso_timestamp)"
  fi
}

# ─── Modo follow ───
run_follow() {
  while true; do
    clear 2>/dev/null || true
    run_once
    echo ""
    echo "  --- Atualizando a cada ${FOLLOW_INTERVAL}s. Ctrl+C para parar. ---"
    sleep "$FOLLOW_INTERVAL"
  done
}

# ─── Execução única ───
run_once() {
  output_header

  local first=true
  if [[ "$SHOW_SUPABASE" == "true" ]]; then
    "$first" || true; first=false
    fetch_supabase_logs
  fi
  if [[ "$SHOW_VERCEL" == "true" ]]; then
    "$first" || true; first=false
    fetch_vercel_logs
  fi
  if [[ "$SHOW_INNGEST" == "true" ]]; then
    "$first" || true; first=false
    fetch_inngest_logs
  fi
  if [[ "$SHOW_TELEMETRY" == "true" ]]; then
    "$first" || true; first=false
    fetch_telemetry_logs
  fi

  if [[ "$OUTPUT_JSON" != "true" ]]; then
    echo ""
    echo "  ─── FIM ───"
  fi
}

# ─── CLI ───
usage() {
  cat <<EOF
Uso: $(basename "$0") [opções]

Coleta logs de Supabase + Vercel + Inngest e formata pra debug com LLM.

Opções:
  -s, --supabase      Apenas logs do Supabase
  -v, --vercel        Apenas logs da Vercel
  -i, --inngest       Apenas logs do Inngest
  -t, --telemetry-only  Apenas telemetria (agent_streaming_telemetry)
  -j, --json          Saída em JSON (pipe-friendly)
  -h, --hours N       Janela de horas (default: 6)
  -e, --errors-only   Apenas entradas com ERROR/FAILED
  -f, --follow        Modo tail (atualiza a cada 30s)
  -c, --config FILE   Caminho do arquivo .env.debug
  --run-id UUID       Filtra telemetria por run_id
  --help              Mostra esta ajuda

Config: variáveis em .env.debug (ver .env.debug.example)
  SUPABASE_PROJECT_REF, SUPABASE_PAT
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (telemetria; fallback: .env.local)
  VERCEL_TOKEN, VERCEL_PROJECT
  INNGEST_SIGNING_KEY, INNGEST_ENV_ID

Aliases sugeridos:
  alias olha-os-logs='./scripts/debug-log.sh'
  alias debug-tudo='./scripts/debug-log.sh --errors-only'
EOF
  exit 0
}

load_config

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--supabase) SHOW_VERCEL=false; SHOW_INNGEST=false; shift;;
    -v|--vercel) SHOW_SUPABASE=false; SHOW_INNGEST=false; shift;;
    -i|--inngest) SHOW_SUPABASE=false; SHOW_VERCEL=false; SHOW_TELEMETRY=false; shift;;
    -t|--telemetry-only) SHOW_SUPABASE=false; SHOW_VERCEL=false; SHOW_INNGEST=false; shift;;
    --run-id) RUN_ID="$2"; shift 2;;
    -j|--json) OUTPUT_JSON=true; shift;;
    -h|--hours) HOURS="$2"; shift 2;;
    -e|--errors-only) ERRORS_ONLY=true; shift;;
    -f|--follow) FOLLOW=true; shift;;
    -c|--config) CONFIG_FILE="$2"; load_config; shift 2;;
    --help) usage;;
    *) echo "Opção desconhecida: $1"; usage;;
  esac
done

# ─── Main ───
if [[ "$FOLLOW" == "true" ]]; then
  run_follow
else
  run_once
fi
