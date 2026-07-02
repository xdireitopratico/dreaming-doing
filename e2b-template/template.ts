/**
 * E2B custom template: dreaming-doing-chromium
 *
 * Pré-instala Chromium + Playwright + Node deps.
 * Inicia stack headed (Xvfb + Chrome + x11vnc + noVNC):
 *   - CDP: porta 9222 (agent loop)
 *   - Live view: porta 6080 (iframe preview — ≠ CDP)
 *
 * Build:
 *   cd e2b-template
 *   npm install
 *   cp ../.env.local .env   # precisa de E2B_API_KEY
 *   npm run build:prod     # ou build:dev
 */

import { Template, waitForPort } from "e2b";

const CHROMIUM_DEVTOOLS_PORT = 9222;
const LIVE_VIEW_PORT = 6080;

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
    // Live view stack (Gate G4)
    "xvfb",
    "x11vnc",
    "novnc",
    "websockify",
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
    DISPLAY: ":99",
  })
  // Playwright + Chromium (auto-download) — Node.js
  .runCmd(
    "mkdir -p /opt/forge && cd /opt/forge && npm init -y && npm install playwright@latest --no-audit --no-fund",
  )
  .runCmd("cd /opt/forge && npx playwright install chromium --with-deps")
  .runCmd("cd /opt/forge && npx playwright install-deps chromium")
  // Browser Use + Playwright Python (sem langchain — Browser Use tem suporte a LLM nativo)
  .runCmd("python3.11 -m pip install --upgrade pip setuptools wheel")
  .runCmd("python3.11 -m pip install playwright browser-use beautifulsoup4 cssutils fonttools lxml")
  // Headed browser + live view + CDP (spec §5, Etapa 4)
  .runCmd(
    `cat > /usr/local/bin/start-browser-stack.sh << 'EOF'
#!/bin/bash
set -euo pipefail

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
  exit 1
fi

export DISPLAY=:99
mkdir -p /tmp/chromium-data /tmp/xvfb

echo "Starting Xvfb on :99"
Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset > /tmp/xvfb.log 2>&1 &
XVFB_PID=$!
sleep 1

echo "Starting Chromium (headed): $CHROME_BIN"
"$CHROME_BIN" \\
  --no-sandbox \\
  --disable-gpu \\
  --disable-dev-shm-usage \\
  --remote-debugging-port=${CHROMIUM_DEVTOOLS_PORT} \\
  --remote-debugging-address=127.0.0.1 \\
  --user-data-dir=/tmp/chromium-data \\
  --no-first-run \\
  --no-default-browser-check \\
  --disable-background-timer-throttling \\
  --disable-backgrounding-occluded-windows \\
  --disable-renderer-backgrounding \\
  --window-size=1280,720 \\
  about:blank > /tmp/chrome.log 2>&1 &
CHROME_PID=$!

echo "Starting x11vnc on :5900"
x11vnc -display :99 -forever -nopw -listen 127.0.0.1 -xkb -rfbport 5900 -shared -noxdamage > /tmp/x11vnc.log 2>&1 &
VNC_PID=$!

NOVNC_WEB="/usr/share/novnc"
if [ ! -d "$NOVNC_WEB" ]; then
  NOVNC_WEB="/usr/share/novnc/utils"
fi
echo "Starting websockify/noVNC on :${LIVE_VIEW_PORT}"
websockify --web="$NOVNC_WEB" ${LIVE_VIEW_PORT} 127.0.0.1:5900 > /tmp/websockify.log 2>&1 &
WS_PID=$!

wait_for_port() {
  local port=$1
  local label=$2
  local attempts=60
  while [ $attempts -gt 0 ]; do
    if curl -sf "http://127.0.0.1:$port/" >/dev/null 2>&1 || curl -sf "http://127.0.0.1:$port/json/version" >/dev/null 2>&1; then
      echo "$label ready on :$port"
      return 0
    fi
    attempts=$((attempts - 1))
    sleep 0.5
  done
  echo "ERROR: $label not ready on :$port"
  return 1
}

wait_for_port ${CHROMIUM_DEVTOOLS_PORT} "Chrome CDP"
wait_for_port ${LIVE_VIEW_PORT} "Live view"

echo "Browser stack ready (CDP :${CHROMIUM_DEVTOOLS_PORT}, live view :${LIVE_VIEW_PORT})"

cleanup() {
  kill $WS_PID $VNC_PID $CHROME_PID $XVFB_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait $CHROME_PID
EOF
chmod +x /usr/local/bin/start-browser-stack.sh`,
  )
  // Start command: CDP + live view; E2B waits for CDP port before marking sandbox ready
  .setStartCmd(
    "/usr/local/bin/start-browser-stack.sh",
    waitForPort(CHROMIUM_DEVTOOLS_PORT),
  );