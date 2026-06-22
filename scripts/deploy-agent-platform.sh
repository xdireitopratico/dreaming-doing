#!/usr/bin/env bash
# Deploy checklist — agent platform (Fase 0 gate).
#
# Usage:
#   ./scripts/deploy-agent-platform.sh              # edge + vercel prod + smoke
#   ./scripts/deploy-agent-platform.sh --skip-vercel
#   ./scripts/deploy-agent-platform.sh --skip-smoke
#   ./scripts/deploy-agent-platform.sh --edge-only
#
# Requires: .env.local with SUPABASE_*, INNGEST_EVENT_KEY (smoke/check)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_VERCEL=0
SKIP_SMOKE=0
EDGE_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --skip-vercel) SKIP_VERCEL=1 ;;
    --skip-smoke) SKIP_SMOKE=1 ;;
    --edge-only) EDGE_ONLY=1; SKIP_VERCEL=1; SKIP_SMOKE=1 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg (use --help)" >&2
      exit 1
      ;;
  esac
done

echo "=== Agent platform deploy ==="

echo "→ check agent-contract mirrors"
npm run check:agent-contract

echo "→ unit tests"
npm run test

echo "→ build inngest bundle"
npm run build:inngest

echo "→ deno: agent-pending-queue"
deno test --allow-env supabase/functions/_shared/agent-pending-queue.test.ts

echo "→ deploy edge: agent-run"
supabase functions deploy agent-run --no-verify-jwt

if [[ "$SKIP_VERCEL" -eq 0 ]]; then
  echo "→ vercel production deploy"
  vercel deploy --prod --yes
fi

if [[ "$EDGE_ONLY" -eq 1 ]]; then
  echo "✓ Edge deploy complete (--edge-only)"
  exit 0
fi

if [[ "$SKIP_SMOKE" -eq 0 ]]; then
  echo "→ check:inngest"
  npm run check:inngest

  echo "→ smoke:agent"
  npm run smoke:agent

  echo "→ check:stale-runs"
  npm run check:stale-runs
fi

echo "✓ Agent platform deploy gate passed"