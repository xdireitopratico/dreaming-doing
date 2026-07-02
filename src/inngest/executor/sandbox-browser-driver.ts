/**
 * Sandbox browser driver — CDP via Playwright inside E2B (127.0.0.1:9222).
 * VM worker orchestrates; Chrome obeys commands run in the sandbox.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { errorMessage } from "@/lib/error-utils";
import { runInSandbox } from "./e2b-client";
import { CDP_PORT } from "./design-dna-preview";

const DRIVER_REMOTE = "/opt/forge/sandbox-cdp-driver.py";

const uploadedSandboxes = new Set<string>();

function driverSourcePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "sandbox-cdp-driver.py"),
    join(process.cwd(), "src/inngest/executor/sandbox-cdp-driver.py"),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p, "utf8");
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error("sandbox-cdp-driver.py not found on worker filesystem");
}

export async function ensureSandboxCdpDriver(
  sandboxId: string,
  accessToken: string | null,
): Promise<void> {
  if (uploadedSandboxes.has(sandboxId)) return;

  const source = readFileSync(driverSourcePath(), "utf8");
  const b64 = Buffer.from(source, "utf8").toString("base64");
  const cmd = `mkdir -p /opt/forge && echo '${b64}' | base64 -d > ${DRIVER_REMOTE} && chmod +x ${DRIVER_REMOTE}`;

  const result = await runInSandbox(sandboxId, accessToken, cmd, { timeoutMs: 30_000 });
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to upload sandbox CDP driver: ${(result.stderr || result.stdout || "").slice(0, 400)}`,
    );
  }
  uploadedSandboxes.add(sandboxId);
}

export type SandboxCdpPayload = Record<string, unknown> & { action: string };

export async function runSandboxCdpAction<T extends Record<string, unknown>>(
  sandboxId: string,
  accessToken: string | null,
  payload: SandboxCdpPayload,
  opts?: { timeoutMs?: number },
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    await ensureSandboxCdpDriver(sandboxId, accessToken);

    const fullPayload = { ...payload, cdpPort: CDP_PORT };
    const escaped = JSON.stringify(fullPayload).replace(/'/g, "'\\''");
    const cmd = `python3.11 ${DRIVER_REMOTE} --payload '${escaped}'`;

    const result = await runInSandbox(sandboxId, accessToken, cmd, {
      timeoutMs: opts?.timeoutMs ?? 120_000,
    });

    if (result.exitCode !== 0) {
      const err = (result.stderr || result.stdout || "driver exit non-zero").trim();
      return { ok: false, error: err.slice(0, 500) };
    }

    const stdout = (result.stdout || "").trim();
    const jsonLine = stdout.split("\n").filter(Boolean).pop() ?? stdout;
    const data = JSON.parse(jsonLine) as T & { error?: string };

    if (typeof data.error === "string" && data.error) {
      return { ok: false, error: data.error };
    }

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export function resetSandboxDriverCacheForTests(): void {
  uploadedSandboxes.clear();
}