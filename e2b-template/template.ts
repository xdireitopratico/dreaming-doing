/**
 * E2B custom template: dreaming-doing-chromium
 *
 * Pré-instala Chromium + Playwright + Node deps.
 * Inicia Chromium com DevTools remoto na porta 9222.
 * Quando um sandbox é criado a partir deste template, Chromium já está
 * rodando e acessível via https://9222-<sandboxId>.e2b.app
 *
 * Build:
 *   cd e2b-template
 *   npm install
 *   cp ../.env.local .env   # precisa de E2B_API_KEY
 *   npm run build:prod     # ou build:dev
 */

import { Template, waitForPort } from "e2b";

const CHROMIUM_DEVTOOLS_PORT = 9222;

export const template = Template()
  .fromUbuntuImage("22.04")
  // Deps base
  .aptInstall([
    "curl",
    "wget",
    "ca-certificates",
    "fonts-liberation",
    "libasound2",
    "libatk-bridge2.0-0",
    "libatk1.0-0",
    "libcairo2",
    "libcups2",
    "libdbus-1-3",
    "libdrm2",
    "libgbm1",
    "libglib2.0-0",
    "libnspr4",
    "libnss3",
    "libpango-1.0-0",
    "libxcomposite1",
    "libxdamage1",
    "libxfixes3",
    "libxkbcommon0",
    "libxrandr2",
    "libxshmfence1",
    "xdg-utils",
  ])
  // Root para instalações
  .setUser("root")
  // Node 20
  .runCmd("apt-get update && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs")
  // Python 3.11+ (Browser Use requer >=3.11)
  .runCmd("apt-get install -y software-properties-common && add-apt-repository -y ppa:deadsnakes/ppa && apt-get update && apt-get install -y python3.11 python3.11-distutils python3.11-venv")
  .runCmd("curl -sS https://bootstrap.pypa.io/get-pip.py | python3.11")
  // Diretório de trabalho — cria antes de setWorkdir
  .runCmd("mkdir -p /opt/forge")
  .setWorkdir("/opt/forge")
  // Variáveis de ambiente — ANTES do Playwright install para guiar o cache
  .setEnvs({
    CHROMIUM_PATH:
      "/opt/forge/node_modules/playwright-core/.local-browsers/chromium-*/chrome-linux*/chrome",
    PLAYWRIGHT_BROWSERS_PATH: "/opt/forge/node_modules/playwright-core/.local-browsers",
    NODE_PATH: "/opt/forge/node_modules",
  })
  // Playwright + Chromium (auto-download) — Node.js
  .runCmd(
    "mkdir -p /opt/forge && cd /opt/forge && npm init -y && npm install playwright@latest --no-audit --no-fund",
  )
  .runCmd("cd /opt/forge && npx playwright install chromium --with-deps")
  .runCmd("cd /opt/forge && npx playwright install-deps chromium")
  // Browser Use + Playwright Python (sem langchain — Browser Use tem suporte a LLM nativo)
  .runCmd("python3.11 -m pip install --upgrade pip setuptools wheel")
  .runCmd("python3.11 -m pip install playwright browser-use")
  // Cria um wrapper para iniciar o Chromium headless com DevTools
  .runCmd(
    `cat > /usr/local/bin/start-chromium.sh << 'EOF'
#!/bin/bash
set -e
# Encontra o binário do Chromium/Chromium headless shell
BROWSERS_DIR="/opt/forge/node_modules/playwright-core/.local-browsers"
CHROME_BIN=""
for d in "$BROWSERS_DIR"/chromium-*/chrome-linux*/chrome "$BROWSERS_DIR"/chromium_headless_shell-*/chrome-linux*/chrome; do
  if [ -x "$d" ]; then
    CHROME_BIN="$d"
    break
  fi
done
if [ -z "$CHROME_BIN" ]; then
  CHROME_BIN=$(find "$BROWSERS_DIR" -maxdepth 4 -type f -name chrome -executable 2>/dev/null | head -1)
fi
if [ -z "$CHROME_BIN" ]; then
  echo "ERROR: Chromium binary not found in $BROWSERS_DIR"
  ls -la "$BROWSERS_DIR"/ 2>/dev/null
  for d in "$BROWSERS_DIR"/*/; do
    echo "--- $d ---"
    ls -la "$d" 2>/dev/null
  done
  exit 1
fi
echo "Starting Chromium: $CHROME_BIN"
mkdir -p /tmp/chromium-data
exec "$CHROME_BIN" \\
  --headless=new \\
  --no-sandbox \\
  --disable-gpu \\
  --disable-dev-shm-usage \\
  --remote-debugging-port=${CHROMIUM_DEVTOOLS_PORT} \\
  --remote-debugging-address=0.0.0.0 \\
  --user-data-dir=/tmp/chromium-data \\
  --no-first-run \\
  --no-default-browser-check \\
  --disable-background-timer-throttling \\
  --disable-backgrounding-occluded-windows \\
  --disable-renderer-backgrounding
EOF
chmod +x /usr/local/bin/start-chromium.sh`,
  )
  // Start command: roda Chromium em background, espera porta 9222 ficar disponível
  .setStartCmd("/usr/local/bin/start-chromium.sh", waitForPort(CHROMIUM_DEVTOOLS_PORT));
