#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# setup-debug.sh — Setup automatizado do debug-log.sh
#
# Uso:
#   source scripts/setup-debug.sh
#   (source é importante para os aliases funcionarem no shell atual)
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_DIR/.env.debug"
EXAMPLE_FILE="$PROJECT_DIR/.env.debug.example"

echo ""
echo "  ════════════════════════════════════════════════"
echo "    debug-log.sh — Setup"
echo "  ════════════════════════════════════════════════"
echo ""

# ─── 1. Verifica dependências ───
echo "  [1/5] Verificando dependências..."

if command -v curl &>/dev/null; then
  echo "    ✓ curl instalado"
else
  echo "    ✗ curl não encontrado. Instale com: apt install curl (ou brew install curl)"
  exit 1
fi

if command -v jq &>/dev/null; then
  echo "    ✓ jq instalado"
else
  echo "    ✗ jq não encontrado. Instale com: apt install jq (ou brew install jq)"
  echo "      Ou: sudo ./scripts/setup-debug.sh (para instalar)"
  if command -v apt &>/dev/null; then
    echo "      Instalando jq..."
    sudo apt install -y jq
  elif command -v brew &>/dev/null; then
    echo "      Instalando jq..."
    brew install jq
  elif command -v nix &>/dev/null; then
    echo "      Instalando jq..."
    nix profile install nixpkgs#jq
  else
    echo "      Instale manualmente: https://jqlang.github.io/jq/download/"
    exit 1
  fi
fi

# ─── 2. Cria .env.debug se não existe ───
echo ""
echo "  [2/5] Arquivo .env.debug..."

if [[ ! -f "$CONFIG_FILE" ]]; then
  cp "$EXAMPLE_FILE" "$CONFIG_FILE"
  echo "    ✓ .env.debug criado a partir de .env.debug.example"
  echo "    ✗ PREENCHA os tokens no .env.debug antes de usar!"
  echo "      $CONFIG_FILE"
else
  echo "    ✓ .env.debug já existe"
fi

chmod 600 "$CONFIG_FILE" 2>/dev/null || true

# ─── 3. Testa conectividade ───
echo ""
echo "  [3/5] Testando conectividade..."

# Carrega config atual
set -a
# shellcheck source=/dev/null
source "$CONFIG_FILE" 2>/dev/null || true
set +a

HAS_TOKEN=false

if [[ -n "${SUPABASE_PAT:-}" ]]; then
  echo "    ✓ Supabase: token presente"
  if curl -sf --max-time 5 "https://api.supabase.com/v1/projects" \
    -H "Authorization: Bearer ${SUPABASE_PAT}" > /dev/null 2>&1; then
    echo "    ✓ Supabase: API responde"
  else
    echo "    ⚠ Supabase: token inválido ou sem acesso"
  fi
  HAS_TOKEN=true
else
  echo "    ⚠ Supabase: sem token (pular)"
fi

if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  echo "    ✓ Vercel: token presente"
  if curl -sf --max-time 5 "https://api.vercel.com/v2/user" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" > /dev/null 2>&1; then
    echo "    ✓ Vercel: API responde"
  else
    echo "    ⚠ Vercel: token inválido ou sem acesso"
  fi
  HAS_TOKEN=true
else
  echo "    ⚠ Vercel: sem token (pular)"
fi

if [[ -n "${INNGEST_SIGNING_KEY:-}" ]]; then
  echo "    ✓ Inngest: signing key presente"
  HAS_TOKEN=true
else
  echo "    ⚠ Inngest: sem token (pular)"
fi

if [[ "$HAS_TOKEN" == "false" ]]; then
  echo ""
  echo "    ✗ NENHUM token configurado!"
  echo "    Preencha as variáveis em $CONFIG_FILE"
fi

# ─── 4. Verifica permissão do script ───
echo ""
echo "  [4/5] Permissão do script..."
chmod +x "$SCRIPT_DIR/debug-log.sh"
echo "    ✓ scripts/debug-log.sh executável"

# ─── 5. Adiciona aliases ───
echo ""
echo "  [5/5] Aliases no shell..."

ZSHRC="${HOME}/.zshrc"
BASHRC="${HOME}/.bashrc"
SHELL_RC=""

if [[ -f "$ZSHRC" ]]; then
  SHELL_RC="$ZSHRC"
elif [[ -f "$BASHRC" ]]; then
  SHELL_RC="$BASHRC"
fi

ALIAS_MARKER="# debug-log aliases"
ALIASES="
$ALIAS_MARKER
alias olha-os-logs='$PROJECT_DIR/scripts/debug-log.sh'
alias debug-supabase='$PROJECT_DIR/scripts/debug-log.sh --supabase'
alias debug-vercel='$PROJECT_DIR/scripts/debug-log.sh --vercel'
alias debug-inngest='$PROJECT_DIR/scripts/debug-log.sh --inngest'
alias debug-tudo='$PROJECT_DIR/scripts/debug-log.sh --errors-only'
"

if [[ -f "$SHELL_RC" ]]; then
  if grep -q "$ALIAS_MARKER" "$SHELL_RC" 2>/dev/null; then
    echo "    ✓ Aliases já existem em $SHELL_RC"
  else
    echo "$ALIASES" >> "$SHELL_RC"
    echo "    ✓ Aliases adicionados em $SHELL_RC"
    echo "    ✓ Recarregue: source $SHELL_RC"
  fi
else
  echo "    ⚠ Nenhum .zshrc/.bashrc encontrado"
  echo "    Adicione manualmente ao seu shell RC:"
  echo "$ALIASES"
fi

# ─── Conclusão ───
echo ""
echo "  ════════════════════════════════════════════════"
echo "    Setup concluído!"
echo ""
echo "    Teste rápido:"
echo "      $PROJECT_DIR/scripts/debug-log.sh"
echo ""
echo "    Próximo passo:"
echo "      source $SHELL_RC  (se aliases foram adicionados)"
echo "      olha-os-logs      (alias curto)"
echo "  ════════════════════════════════════════════════"
echo ""
