#!/usr/bin/env bash
# Aplica todas as migrations pendentes na sua conta Supabase (dpduljngdurfpmaclffa).
# Pré-req: supabase CLI logado + linked com o ref correto.
set -euo pipefail

REF="dpduljngdurfpmaclffa"
LINKED="supabase/.temp/linked-project.json"
echo "→ Verificando link..."
if [[ ! -f "$LINKED" ]] || ! grep -q "\"ref\"[[:space:]]*:[[:space:]]*\"$REF\"" "$LINKED" 2>/dev/null; then
  echo "  Projeto não linked com $REF. Rode: supabase link --project-ref $REF"
  exit 1
fi

echo "→ Aplicando migrations em $REF"
supabase db push --linked

echo "✓ Migrations sincronizadas."
