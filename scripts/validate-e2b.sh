#!/usr/bin/env bash
# Validação E2B: edge functions + template default no código.
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-dpduljngdurfpmaclffa}"
BASE="https://${REF}.supabase.co/functions/v1"

echo "→ e2b-health auth gate"
AUTH=$(curl -s -X POST "${BASE}/e2b-health" -H "Content-Type: application/json" -d '{}')
echo "$AUTH" | grep -q 'Não autenticado'

echo "→ template default no código"
grep -q 'code-interpreter-v1' supabase/functions/_shared/e2b.ts
grep -q 'createValidatedE2bSandbox' supabase/functions/_shared/e2b-smoke.ts
grep -q 'createValidatedE2bSandbox' supabase/functions/_shared/project-sandbox.ts

echo "→ connector-upsert smoke hook"
grep -q 'runE2bSmokeTest' supabase/functions/connector-upsert/index.ts

echo "→ project-delete killAll + metadata"
grep -q 'killAllProjectSandboxes' supabase/functions/project-delete/index.ts
grep -q 'forgeSandboxMetadata' supabase/functions/_shared/project-sandbox.ts
grep -q 'e2b-cleanup' scripts/sync/deploy-all.sh

echo "→ vitest e2b-status"
npm test -- --run src/lib/e2b-status.test.ts >/dev/null

echo "✓ E2B stack OK (smoke real: salve chave em /api ou POST e2b-health com JWT)"