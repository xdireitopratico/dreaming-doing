#!/usr/bin/env bash
# Faz deploy de todas as edge functions atuais para sua conta Supabase.
set -euo pipefail

REF="dpduljngdurfpmaclffa"
FUNCTIONS=(
  agent-run
  admin-platform-secrets
  connector-upsert
  deploy-publish
  github-import
  mcp-server
  preview-boot
  project-delete
  voice-transcribe
)

echo "→ Deployando ${#FUNCTIONS[@]} edge functions em $REF"
for fn in "${FUNCTIONS[@]}"; do
  echo "  • $fn"
  supabase functions deploy "$fn" --project-ref "$REF" --no-verify-jwt
done

echo "✓ Edge functions sincronizadas."
echo "  Lembre: secrets precisam estar configuradas (veja secrets-checklist.md)."
