/** Detecção de porta/comando dev e boot do Vite no sandbox E2B. */
import { E2B_PROJECT_DIR } from "./e2b.ts";
import type { E2bRestSandbox } from "./e2b-rest.ts";

export const PREVIEW_TTL_MS = 25 * 60 * 1000;
export const PROBE_ATTEMPTS = 3;
export const PROBE_ATTEMPTS_AFTER_BOOT = 10;
export const PROBE_INTERVAL_MS = 2000;
export const PROBE_FETCH_MS = 4000;

export function detectDevPort(files: Array<{ path: string; content?: string | null }>): string {
  const pkg = files.find((f) => f.path === "package.json" || f.path === "/package.json");
  if (pkg?.content) {
    try {
      const scripts = (JSON.parse(pkg.content) as { scripts?: Record<string, string> }).scripts;
      const dev = scripts?.dev ?? scripts?.start ?? "";
      const m = dev.match(/--port\s+(\d{2,5})/) ?? dev.match(/:(\d{2,5})/);
      if (m?.[1]) return m[1];
    } catch {
      /* ignore */
    }
  }
  const vite = files.find((f) => f.path.includes("vite.config"));
  if (vite?.content) {
    const m = vite.content.match(/port:\s*(\d{2,5})/);
    if (m?.[1]) return m[1];
  }
  return "5173";
}

export function detectDevCommand(
  files: Array<{ path: string; content?: string | null }>,
  port: number,
): string {
  const pkg = files.find((f) => f.path === "package.json" || f.path === "/package.json");
  if (pkg?.content) {
    try {
      const scripts = (JSON.parse(pkg.content) as { scripts?: Record<string, string> }).scripts;
      if (scripts?.dev) {
        const dev = scripts.dev;
        if (dev.includes("vite") && !dev.includes("--host")) {
          return `npm run dev -- --host 0.0.0.0 --port ${port}`;
        }
        return `env HOST=0.0.0.0 PORT=${port} npm run dev`;
      }
      if (scripts?.start) return `env HOST=0.0.0.0 PORT=${port} npm start`;
    } catch {
      /* ignore */
    }
  }
  return `npx vite --host 0.0.0.0 --port ${port}`;
}

export function isCachedPreviewValid(
  meta: Record<string, unknown>,
  force?: boolean,
): { url: string; expiresAt: string } | null {
  if (force) return null;
  const url = typeof meta.previewUrl === "string" ? meta.previewUrl.trim() : "";
  const expiresAt = typeof meta.previewExpiresAt === "string" ? meta.previewExpiresAt : "";
  if (!url || !expiresAt) return null;
  const exp = new Date(expiresAt).getTime();
  if (exp > Date.now() + 60_000) {
    return { url, expiresAt };
  }
  return null;
}

export async function probePreviewUrl(url: string, attempts = PROBE_ATTEMPTS): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const probe = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(PROBE_FETCH_MS),
      });
      if (probe.ok || (probe.status >= 200 && probe.status < 500)) {
        return true;
      }
    } catch {
      /* Vite ainda subindo */
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, PROBE_INTERVAL_MS));
    }
  }
  return false;
}

/** Instala deps (se necessário), mata Vite antigo e sobe dev server em background. */
export async function bootDevServerInSandbox(
  sandbox: E2bRestSandbox,
  files: Array<{ path: string; content?: string | null }>,
  devPort: number,
): Promise<{ devCmd: string; installOk: boolean }> {
  const devCmd = detectDevCommand(files, devPort);
  const hasPkg = files.some((f) => f.path === "package.json" || f.path === "/package.json");

  let installOk = true;
  if (hasPkg) {
    const modulesCheck = await sandbox.commands.run(
      `test -d ${E2B_PROJECT_DIR}/node_modules && echo has_modules || echo missing`,
      { cwd: E2B_PROJECT_DIR, timeoutMs: 5_000 },
    );
    const hasModules = (modulesCheck.stdout ?? "").includes("has_modules");
    if (!hasModules) {
      const install = await sandbox.commands.run(
        `cd ${E2B_PROJECT_DIR} && npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -30`,
        { cwd: E2B_PROJECT_DIR, timeoutMs: 90_000 },
      );
      installOk = (install.exitCode ?? 1) === 0;
    }
  }

  await sandbox.commands.run(
    `pkill -f "vite.*${devPort}" 2>/dev/null || pkill -f "node.*vite" 2>/dev/null || true`,
    { cwd: E2B_PROJECT_DIR, timeoutMs: 5_000 },
  );

  await sandbox.commands.run(
    `cd ${E2B_PROJECT_DIR} && nohup ${devCmd} > /tmp/forge-dev.log 2>&1 &`,
    { cwd: E2B_PROJECT_DIR, timeoutMs: 15_000, background: true },
  );

  return { devCmd, installOk };
}

export async function readDevLogTail(sandbox: E2bRestSandbox): Promise<string> {
  const log = await sandbox.commands.run(
    "tail -40 /tmp/forge-dev.log 2>/dev/null || echo '(sem log)'",
    {
      cwd: E2B_PROJECT_DIR,
      timeoutMs: 8_000,
    },
  );
  return (log.stdout ?? "").slice(-2000);
}
