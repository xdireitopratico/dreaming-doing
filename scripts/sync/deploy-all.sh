#!/usr/bin/env bash
# Faz deploy de todas as edge functions atuais para sua conta Supabase.
set -euo pipefail

REF="dpduljngdurfpmaclffa"
FORGE_APP_FUNCTIONS=(
  agent-run
  health
  admin-platform-secrets
  connector-upsert
  e2b-health
  e2b-cleanup
  deploy-publish
  github-import
  mcp-server
  preview-boot
  project-delete
  voice-transcribe
)

AETHERFORGE_FUNCTIONS=(
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
  web-research-tools
  admin-secrets-map
)

FUNCTIONS=("${FORGE_APP_FUNCTIONS[@]}" "${AETHERFORGE_FUNCTIONS[@]}")

echo "→ Deployando ${#FUNCTIONS[@]} edge functions em $REF"
for fn in "${FUNCTIONS[@]}"; do
  echo "  • $fn"
  supabase functions deploy "$fn" --project-ref "$REF" --no-verify-jwt
done

echo "✓ Edge functions sincronizadas."
echo "  Lembre: secrets precisam estar configuradas (veja secrets-checklist.md)."
