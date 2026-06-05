#!/usr/bin/env bash
# Aplica todas as migrations pendentes na sua conta Supabase (dpduljngdurfpmaclffa).
# Pré-req: supabase CLI logado + linked com o ref correto.
set -euo pipefail

REF="dpduljngdurfpmaclffa"
echo "→ Verificando link..."
supabase status >/dev/null 2>&1 || {
  echo "  CLI não está linked. Rode: supabase link --project-ref $REF"
  exit 1
}

echo "→ Aplicando migrations em $REF"
supabase db push --linked

echo "✓ Migrations sincronizadas."
