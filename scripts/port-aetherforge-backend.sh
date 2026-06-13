#!/usr/bin/env bash
# Porta edge functions + _shared AetherForge/Prometheus do vibrant → dreaming-doing
set -euo pipefail

VIBRANT="/home/rdarienzo/Projetos/vibrant-visionary-craft1/supabase/functions"
DEST="/home/rdarienzo/Projetos/dreaming-doing/supabase/functions"

SHARED_FILES=(
  gateway-core.ts gateway-saga.ts gateway-whatsapp.ts gateway-voice.ts
  executor-llm.ts executor-tool.ts executor-memory.ts executor-subflow.ts executor-vision.ts
  llm-router.ts model-catalog.ts tool-executor.ts
  memory-manager.ts multi-agent-bus.ts condition-evaluator.ts semantic-cache.ts
  output-guards.ts eval-layer.ts canary-router.ts context-window-manager.ts
  provider-health.ts egress-meter.ts marketplace-billing.ts
  prometheus-types.ts prometheus-db.ts prometheus-cortex.ts prometheus-pipeline.ts
  prometheus-react-loop.ts prometheus-analyst.ts prometheus-architect.ts prometheus-scribe.ts
  prometheus-sentinel.ts prometheus-tools.ts prometheus-prompts.ts prometheus-deliberation.ts
  prometheus-enrichment.ts prometheus-report.ts prometheus-physician.ts prometheus-codex.ts
  security.ts rateLimiter.ts
  # FORGE-only (não copiar do vibrant):
  # connector-llm-bridge.ts — ver supabase/functions/_shared/connector-llm-bridge.ts
)

EDGE_FUNCTIONS=(
  aetherforge-gateway
  aetherforge-rag-embed
  aetherforge-api-proxy
  aetherforge-cron
  aetherforge-webhook-worker
  aetherforge-healthz
  aetherforge-gdpr
  aetherforge-marketplace-checkout
  aetherforge-widget
  prometheus-builder
  prometheus-tool-executor
  prometheus-healer
  prometheus-learn-pipeline
  firecrawl-search
  firecrawl-scrape
)

mkdir -p "$DEST/_shared"

for f in "${SHARED_FILES[@]}"; do
  src="$VIBRANT/_shared/$f"
  if [[ ! -f "$src" ]]; then
    echo "MISSING shared: $f" >&2
    exit 1
  fi
  cp "$src" "$DEST/_shared/$f"
  echo "shared → $f"
done

for fn in "${EDGE_FUNCTIONS[@]}"; do
  src="$VIBRANT/$fn"
  if [[ ! -d "$src" ]]; then
    echo "MISSING function: $fn" >&2
    exit 1
  fi
  rm -rf "$DEST/$fn"
  cp -r "$src" "$DEST/$fn"
  echo "function → $fn"
done

echo "✓ Backend AetherForge portado (${#SHARED_FILES[@]} shared, ${#EDGE_FUNCTIONS[@]} functions)"