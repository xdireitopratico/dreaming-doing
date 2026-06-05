#!/usr/bin/env bash
# Espelha Lovable Cloud → Supabase canônico (dpduljngdurfpmaclffa):
# migrations + deploy de todas as edge functions.
#
# Uso (após pull/merge com mudanças em supabase/):
#   ./scripts/sync/sync-all.sh
#
# Pré-req: supabase login + link (migrate.sh valida o ref).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "═══════════════════════════════════════════════════════════"
echo "  FORGE sync-all → dpduljngdurfpmaclffa"
echo "═══════════════════════════════════════════════════════════"
echo ""

"$ROOT/scripts/sync/migrate.sh"
echo ""
"$ROOT/scripts/sync/deploy-all.sh"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✓ sync-all concluído"
echo "  Secrets: scripts/sync/secrets-checklist.md"
echo "  Vercel:  VITE_SUPABASE_URL=https://dpduljngdurfpmaclffa.supabase.co"
echo "═══════════════════════════════════════════════════════════"