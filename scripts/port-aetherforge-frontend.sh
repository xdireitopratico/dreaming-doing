#!/usr/bin/env bash
# Porta UI AetherForge/Prometheus do vibrant → dreaming-doing + codemod de imports
set -euo pipefail

VIBRANT="/home/rdarienzo/Projetos/vibrant-visionary-craft1/src/components"
DEST_AGENTS="/home/rdarienzo/Projetos/dreaming-doing/src/components/forge-agents"
DEST_PROM="/home/rdarienzo/Projetos/dreaming-doing/src/components/forge-prometheus"

rm -rf "$DEST_AGENTS" "$DEST_PROM"
cp -r "$VIBRANT/admin/agent-builder" "$DEST_AGENTS"
cp -r "$VIBRANT/prometheus-studio" "$DEST_PROM"

# Codemod imports em ambas as árvores
find "$DEST_AGENTS" "$DEST_PROM" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | while IFS= read -r -d '' f; do
  sed -i \
    -e 's|@/components/admin/agent-builder/|@/components/forge-agents/|g' \
    -e 's|@/components/prometheus-studio/|@/components/forge-prometheus/|g' \
    -e 's|@/hooks/use-toast|@/lib/toast|g' \
    -e 's|from "@/hooks/useAdmin"|from "@/lib/forge-admin"|g' \
    -e 's|@/components/prometheus-studio/prometheus-studio.css|@/styles/forge-agents-theme.css|g' \
    -e 's|@/components/forge-prometheus/prometheus-studio.css|@/styles/forge-agents-theme.css|g' \
    -e 's|\.\./admin/agent-builder/prometheus/|@/components/forge-agents/prometheus/|g' \
    -e 's|\.\./admin/agent-builder/|@/components/forge-agents/|g' \
    "$f"
done

# useToast → toast (sonner) — padrão comum no vibrant
find "$DEST_AGENTS" "$DEST_PROM" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | while IFS= read -r -d '' f; do
  if grep -q 'useToast' "$f" 2>/dev/null; then
    sed -i \
      -e 's|import { useToast } from "@/lib/toast"|import { toast } from "@/lib/toast"|g' \
      -e 's|const { toast } = useToast()||g' \
      "$f"
  fi
done

# Hooks usados pelo Prometheus (não copiados com agent-builder)
HOOKS_DEST="/home/rdarienzo/Projetos/dreaming-doing/src/hooks"
mkdir -p "$HOOKS_DEST"
for hook in useWhisperSTT.ts useCelebration.ts; do
  cp "$VIBRANT/../hooks/$hook" "$HOOKS_DEST/$hook"
done

AGENT_COUNT=$(find "$DEST_AGENTS" -type f | wc -l)
PROM_COUNT=$(find "$DEST_PROM" -type f | wc -l)
echo "✓ forge-agents: $AGENT_COUNT arquivos"
echo "✓ forge-prometheus: $PROM_COUNT arquivos"