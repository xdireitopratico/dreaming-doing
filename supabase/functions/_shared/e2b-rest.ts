/**
 * Cliente E2B v2 via REST + Connect — sem npm:e2b (incompatível com Supabase Edge Runtime).
 * Platform API: api.e2b.app | Sandbox envd: https://49983-{sandboxId}.e2b.app
 */
import {
  E2B_API_BASE,
  E2B_TEMPLATE_DEFAULT,
  e2bCreateSandbox,
  e2bDeleteSandbox,
  e2bPreviewUrl,
} from "./e2b.ts";

const ENVD_PORT = 49983;
const DEFAULT_TIMEOUT_SEC = 1800;
const FILE_UPLOAD_CONCURRENCY = 5;

export type E2bCommandResult = {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
};

export type E2bRunOpts = {
  cwd?: string;
  timeoutMs?: number;
  /** Retorna após evento `start` — processo continua no sandbox. */
  background?: boolean;
};

/** Interface compatível com o antigo E2BSandboxInstance (sem npm:e2b). */
export type E2bRestSandbox = {
  sandboxId: string;
  commands: {
    run: (command: string, opts?: E2bRunOpts) => Promise<E2bCommandResult>;
  };
  files: {
    write: (payload: Array<{ path: string; data: string }>) => Promise<void>;
  };
  getHost: (port: number) => string;
  kill: () => Promise<void>;
};

type SandboxSession = {
  sandboxId: string;
  apiKey: string;
  accessToken: string | null;
};

function envdUrl(sandboxId: string, path: string): string {
  const base = e2bPreviewUrl(sandboxId, ENVD_PORT);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function sessionHeaders(session: SandboxSession): Record<string, string> {
  const h: Record<string, string> = {};
  if (session.accessToken) h["X-Access-Token"] = session.accessToken;
  return h;
}

async function e2bConnectSandbox(
  apiKey: string,
  sandboxId: string,
  timeoutSeconds = DEFAULT_TIMEOUT_SEC,
): Promise<{ sandboxId: string; accessToken: string | null }> {
  const resp = await fetch(`${E2B_API_BASE}/sandboxes/${sandboxId}/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ timeout: timeoutSeconds }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`E2B connect ${resp.status}: ${text.slice(0, 400)}`);
  }
  const data = JSON.parse(text) as {
    sandboxID?: string;
    sandboxId?: string;
    envdAccessToken?: string | null;
  };
  const id = data.sandboxID ?? data.sandboxId ?? sandboxId;
  return { sandboxId: id, accessToken: data.envdAccessToken ?? null };
}

async function uploadFile(session: SandboxSession, path: string, data: string): Promise<void> {
  const url = `${envdUrl(session.sandboxId, "/files")}?path=${encodeURIComponent(path)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      ...sessionHeaders(session),
      "Content-Type": "application/octet-stream",
    },
    body: data,
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`E2B write ${path} ${resp.status}: ${err.slice(0, 300)}`);
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

function decodeConnectBytes(value: string): string {
  try {
    return atob(value);
  } catch {
    return value;
  }
}

/** Parseia stream Connect JSON (NDJSON) do process.Process/Start. */
export function parseConnectProcessStream(
  raw: string,
  opts?: { background?: boolean },
): E2bCommandResult {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let started = false;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    const event = frame.event as Record<string, unknown> | undefined;
    if (!event) continue;

    if (event.start && opts?.background) {
      started = true;
      break;
    }

    const data = event.data as Record<string, unknown> | undefined;
    if (data) {
      if (typeof data.stdout === "string") {
        stdout += decodeConnectBytes(data.stdout);
      }
      if (typeof data.stderr === "string") {
        stderr += decodeConnectBytes(data.stderr);
      }
    }

    const end = event.end as Record<string, unknown> | undefined;
    if (end) {
      const status = typeof end.status === "string" ? end.status : "";
      const m = status.match(/(\d+)/);
      exitCode = m ? Number.parseInt(m[1], 10) : end.exited === false ? 1 : 0;
      if (typeof end.error === "string" && end.error) stderr += end.error;
      break;
    }
  }

  if (opts?.background && started) {
    return { exitCode: 0, stdout: "", stderr: "" };
  }

  return { exitCode, stdout, stderr };
}

async function runProcess(
  session: SandboxSession,
  command: string,
  opts?: E2bRunOpts,
): Promise<E2bCommandResult> {
  const cwd = opts?.cwd ?? "/home/user";
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const url = envdUrl(session.sandboxId, "/process.Process/Start");

  const body = JSON.stringify({
    process: {
      cmd: "/bin/bash",
      args: ["-lc", command],
      cwd,
    },
    stdin: false,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        ...sessionHeaders(session),
        "Content-Type": "application/connect+json",
        "Connect-Protocol-Version": "1",
        "Connect-Timeout-Ms": String(timeoutMs),
      },
      body,
      signal: controller.signal,
    });

    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`E2B process ${resp.status}: ${text.slice(0, 400)}`);
    }

    return parseConnectProcessStream(text, { background: opts?.background });
  } catch (e) {
    if (opts?.background && e instanceof Error && e.name === "AbortError") {
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { exitCode: 1, stdout: "", stderr: msg };
  } finally {
    clearTimeout(timer);
  }
}

function buildSandbox(session: SandboxSession): E2bRestSandbox {
  return {
    sandboxId: session.sandboxId,
    commands: {
      run: (command, opts) => runProcess(session, command, opts),
    },
    files: {
      write: async (payload) => {
        if (payload.length === 0) return;
        await runWithConcurrency(payload, FILE_UPLOAD_CONCURRENCY, async (f) => {
          await uploadFile(session, f.path, f.data);
        });
      },
    },
    getHost: (port) => e2bPreviewUrl(session.sandboxId, port).replace(/^https:\/\//, ""),
    kill: () => e2bDeleteSandbox(session.apiKey, session.sandboxId),
  };
}

export async function e2bRestCreate(
  apiKey: string,
  template = E2B_TEMPLATE_DEFAULT,
  timeoutSeconds = DEFAULT_TIMEOUT_SEC,
): Promise<E2bRestSandbox> {
  const { sandboxID, raw } = await e2bCreateSandbox(apiKey, template, timeoutSeconds);
  let accessToken = (raw.envdAccessToken as string | null | undefined) ?? null;

  if (!accessToken) {
    const connected = await e2bConnectSandbox(apiKey, sandboxID, timeoutSeconds);
    accessToken = connected.accessToken;
  }

  return buildSandbox({ sandboxId: sandboxID, apiKey, accessToken });
}

export async function e2bRestConnect(
  apiKey: string,
  sandboxId: string,
  timeoutSeconds = DEFAULT_TIMEOUT_SEC,
): Promise<E2bRestSandbox> {
  const connected = await e2bConnectSandbox(apiKey, sandboxId, timeoutSeconds);
  return buildSandbox({
    sandboxId: connected.sandboxId,
    apiKey,
    accessToken: connected.accessToken,
  });
}
