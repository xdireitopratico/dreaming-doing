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
  // Node 20
  .runCmd("curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs")
  // Playwright + Chromium (auto-download)
  .runCmd(
    "mkdir -p /opt/forge && cd /opt/forge && npm init -y && npm install playwright@latest --no-audit --no-fund",
  )
  .runCmd("cd /opt/forge && npx playwright install chromium --with-deps")
  .runCmd("cd /opt/forge && npx playwright install-deps chromium")
  // Diretório de trabalho
  .setWorkdir("/opt/forge")
  .setUser("root")
  // Variáveis de ambiente
  .setEnvs({
    CHROMIUM_PATH:
      "/opt/forge/node_modules/playwright-core/.local-browsers/chromium-*/chrome-linux/chrome",
    PLAYWRIGHT_BROWSERS_PATH: "/opt/forge/node_modules/playwright-core/.local-browsers",
    NODE_PATH: "/opt/forge/node_modules",
  })
  // Cria um wrapper para iniciar o Chromium headless com DevTools
  .runCmd(
    `cat > /usr/local/bin/start-chromium.sh << 'EOF'
#!/bin/bash
set -e
# Encontra o binário do Chromium
CHROME_BIN=$(ls -d /opt/forge/node_modules/playwright-core/.local-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)
if [ -z "$CHROME_BIN" ] || [ ! -x "$CHROME_BIN" ]; then
  echo "ERROR: Chromium binary not found"
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
