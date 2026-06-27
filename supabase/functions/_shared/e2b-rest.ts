/**
 * Cliente E2B v2 via REST + Connect — sem npm:e2b (incompatível com Supabase Edge Runtime).
 * Platform API: api.e2b.app | Envd RPC: relay sandbox.e2b.app + headers E2b-Sandbox-Id/Port
 */
import {
  E2B_API_BASE,
  E2B_DOMAIN,
  E2B_TEMPLATE_DEFAULT,
  e2bCreateSandbox,
  e2bDeleteSandbox,
  e2bPreviewUrl,
} from "./e2b.ts";

const ENVD_PORT = 49983;
const ENVD_RELAY = `https://sandbox.${E2B_DOMAIN}`;
const DEFAULT_TIMEOUT_SEC = 900;
const FILE_UPLOAD_CONCURRENCY = 5;
const KEEPALIVE_PING_INTERVAL_SEC = 50;

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

function envdRelayPath(path: string): string {
  return `${ENVD_RELAY}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Headers exigidos pelo relay E2B (igual ao SDK oficial). */
function envdRelayHeaders(sandboxId: string, accessToken: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "E2b-Sandbox-Id": sandboxId,
    "E2b-Sandbox-Port": String(ENVD_PORT),
  };
  if (accessToken) h["X-Access-Token"] = accessToken;
  return h;
}

function sessionHeaders(session: SandboxSession): Record<string, string> {
  return envdRelayHeaders(session.sandboxId, session.accessToken);
}

/** Aguarda envd responder antes de rodar comandos (evita smoke falso-negativo). */
export async function waitForEnvdReady(
  sandboxId: string,
  accessToken: string | null,
  maxMs = 45_000,
): Promise<void> {
  const headers = envdRelayHeaders(sandboxId, accessToken);
  const started = Date.now();
  let lastStatus = 0;

  while (Date.now() - started < maxMs) {
    try {
      const resp = await fetch(envdRelayPath("/health"), {
        headers,
        redirect: "follow",
      });
      lastStatus = resp.status;
      if (resp.status === 204) return;
    } catch {
      /* envd ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`E2B envd não ficou pronto (${lastStatus || "sem resposta"} em ${maxMs}ms)`);
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
  const url = `${envdRelayPath("/files")}?path=${encodeURIComponent(path)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      ...sessionHeaders(session),
      "Content-Type": "application/octet-stream",
    },
    body: data,
    redirect: "follow",
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

/** Empacota JSON no framing Connect (application/connect+json streaming). */
export function encodeConnectEnvelope(messageJson: string, endStream = false): Uint8Array {
  const payload = new TextEncoder().encode(messageJson);
  const out = new Uint8Array(5 + payload.length);
  out[0] = endStream ? 0x02 : 0x00;
  new DataView(out.buffer).setUint32(1, payload.length, false);
  out.set(payload, 5);
  return out;
}

/** Desempacota envelopes Connect JSON até EndStream (flag 0x02). */
export function decodeConnectJsonStream(bytes: Uint8Array): string[] {
  const messages: string[] = [];
  let offset = 0;

  while (offset + 5 <= bytes.length) {
    const flags = bytes[offset];
    const len = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false);
    offset += 5;
    if (len > bytes.length - offset) break;

    const payload = new TextDecoder().decode(bytes.subarray(offset, offset + len));
    offset += len;

    if (flags & 0x02) break;
    messages.push(payload);
  }

  return messages;
}

function parseProcessEventMessages(
  messages: string[],
  opts?: { background?: boolean },
): E2bCommandResult {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let started = false;
  let sawEnd = false;

  for (const message of messages) {
    const trimmed = message.trim();
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
      sawEnd = true;
      const status = typeof end.status === "string" ? end.status : "";
      const m = status.match(/(\d+)/);
      const exitFromField =
        typeof end.exitCode === "number"
          ? end.exitCode
          : typeof (end as { exit_code?: number }).exit_code === "number"
            ? (end as { exit_code: number }).exit_code
            : null;
      exitCode = m ? Number.parseInt(m[1], 10) : (exitFromField ?? (end.exited === false ? 1 : 0));
      if (typeof end.error === "string" && end.error) stderr += end.error;
      break;
    }
  }

  if (opts?.background && started) {
    return { exitCode: 0, stdout: "", stderr: "" };
  }

  if (!sawEnd) {
    return {
      exitCode: 1,
      stdout,
      stderr: stderr || "processo terminou sem evento end (stream Connect incompleto?)",
    };
  }

  return { exitCode, stdout, stderr };
}

/** Parseia stream Connect do process.Process/Start (envelope binário ou NDJSON em testes). */
export function parseConnectProcessStream(
  raw: string | Uint8Array,
  opts?: { background?: boolean },
): E2bCommandResult {
  if (raw instanceof Uint8Array) {
    return parseProcessEventMessages(decodeConnectJsonStream(raw), opts);
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.includes("\n")) {
    return parseProcessEventMessages(
      trimmed
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      opts,
    );
  }

  return parseProcessEventMessages(decodeConnectJsonStream(new TextEncoder().encode(raw)), opts);
}

async function runProcess(
  session: SandboxSession,
  command: string,
  opts?: E2bRunOpts,
): Promise<E2bCommandResult> {
  const cwd = opts?.cwd ?? "/home/user";
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const url = envdRelayPath("/process.Process/Start");

  const requestJson = JSON.stringify({
    process: {
      cmd: "/bin/bash",
      args: ["-l", "-c", command],
      cwd,
    },
    stdin: false,
  });
  const body = encodeConnectEnvelope(requestJson);

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
        "Keepalive-Ping-Interval": String(KEEPALIVE_PING_INTERVAL_SEC),
      },
      body: body as unknown as BodyInit,
      signal: controller.signal,
      redirect: "follow",
    });

    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (!resp.ok) {
      const errText = new TextDecoder().decode(bytes).slice(0, 400);
      throw new Error(`E2B process ${resp.status}: ${errText}`);
    }

    return parseConnectProcessStream(bytes, { background: opts?.background });
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
    kill: async () => {
      await e2bDeleteSandbox(session.apiKey, session.sandboxId);
    },
  };
}

export async function e2bRestCreate(
  apiKey: string,
  template = E2B_TEMPLATE_DEFAULT,
  timeoutSeconds = DEFAULT_TIMEOUT_SEC,
  metadata?: Record<string, string>,
): Promise<E2bRestSandbox> {
  const { sandboxID, raw } = await e2bCreateSandbox(apiKey, {
    templateID: template,
    timeoutSeconds,
    metadata,
    secure: true,
  });
  let accessToken = (raw.envdAccessToken as string | null | undefined) ?? null;
  let sandboxId = sandboxID;

  const connected = await e2bConnectSandbox(apiKey, sandboxID, timeoutSeconds);
  sandboxId = connected.sandboxId;
  if (!accessToken) accessToken = connected.accessToken;

  if (!accessToken) {
    console.warn("[e2b-rest] sandbox criado sem envdAccessToken (template legado?)");
  }

  await waitForEnvdReady(sandboxId, accessToken);
  return buildSandbox({ sandboxId, apiKey, accessToken });
}

export async function e2bRestConnect(
  apiKey: string,
  sandboxId: string,
  timeoutSeconds = DEFAULT_TIMEOUT_SEC,
): Promise<E2bRestSandbox> {
  const connected = await e2bConnectSandbox(apiKey, sandboxId, timeoutSeconds);
  await waitForEnvdReady(connected.sandboxId, connected.accessToken);
  return buildSandbox({
    sandboxId: connected.sandboxId,
    apiKey,
    accessToken: connected.accessToken,
  });
}
