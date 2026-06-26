const E2B_API_BASE = process.env.E2B_API_BASE || "https://api.e2b.app";
const E2B_DOMAIN = process.env.E2B_DOMAIN || "e2b.app";
const ENVD_PORT = 49983;
const ENVD_RELAY = `https://sandbox.${E2B_DOMAIN}`;
const KEEPALIVE_PING_INTERVAL_SEC = 50;

export type E2bCommandResult = {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
};

export type E2bRunOpts = {
  cwd?: string;
  timeoutMs?: number;
  background?: boolean;
};

export type E2bConnectResult = {
  sandboxId: string;
  accessToken: string | null;
};

function envdRelayPath(path: string): string {
  return `${ENVD_RELAY}${path.startsWith("/") ? path : `/${path}`}`;
}

function envdRelayHeaders(sandboxId: string, accessToken: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "E2b-Sandbox-Id": sandboxId,
    "E2b-Sandbox-Port": String(ENVD_PORT),
  };
  if (accessToken) h["X-Access-Token"] = accessToken;
  return h;
}

function encodeConnectEnvelope(messageJson: string, endStream = false): Uint8Array {
  const payload = new TextEncoder().encode(messageJson);
  const out = new Uint8Array(5 + payload.length);
  out[0] = endStream ? 0x02 : 0x00;
  new DataView(out.buffer).setUint32(1, payload.length, false);
  out.set(payload, 5);
  return out;
}

function decodeConnectJsonStream(bytes: Uint8Array): string[] {
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

function decodeConnectBytes(value: string): string {
  try {
    return atob(value);
  } catch {
    return value;
  }
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
      stderr: stderr || "process ended without end event (incomplete Connect stream?)",
    };
  }

  return { exitCode, stdout, stderr };
}

function parseConnectProcessStream(
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
  sandboxId: string,
  accessToken: string | null,
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
        ...envdRelayHeaders(sandboxId, accessToken),
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
    return { exitCode: 1, stdout: "", stderr: `E2B run failed: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

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
      /* envd still starting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`E2B envd not ready (${lastStatus || "no response"} in ${maxMs}ms)`);
}

export async function connectToSandbox(
  sandboxId: string,
  apiKey: string,
  timeoutSeconds = 1800,
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

export async function runInSandbox(
  sandboxId: string,
  accessToken: string | null,
  command: string,
  opts?: E2bRunOpts,
): Promise<E2bCommandResult> {
  return runProcess(sandboxId, accessToken, command, opts);
}
