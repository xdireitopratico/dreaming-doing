interface Env {
  DESIGN_DNA_EMAIL_KV: KVNamespace;
  FORGE_DOMAIN: string;
}

interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  receivedAt: string;
}

interface EmailSession {
  sessionId: string;
  email: string;
  createdAt: string;
  messages: EmailMessage[];
}

interface ParsedEmail {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
}

const EMAIL_DOMAIN_PREFIX = "design-dna";
const WAIT_TIMEOUT_MS = 60_000;
const WAIT_POLL_INTERVAL_MS = 2_000;

const KV_KEYS = {
  session: (id: string) => `session:${id}`,
  email: (addr: string) => `email:${addr}`,
};

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function isValidSessionId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function extractHeader(headers: string, name: string): string | null {
  const regex = new RegExp(`^${name}:\\s*(.*(?:\r\n[ \t].*)*)`, "im");
  const match = headers.match(regex);
  if (!match) return null;
  return match[1]
    .replace(/\r\n[ \t]+/g, " ")
    .replace(/^=\?UTF-8\?B\?([^?]+)\?=$/i, (_, b64) => {
      try {
        return atob(b64);
      } catch {
        return _;
      }
    })
    .replace(/^=\?UTF-8\?Q\?([^?]+)\?=$/i, (_, qp) => {
      return qp.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    })
    .trim();
}

async function parseEmail(raw: ReadableStream): Promise<ParsedEmail> {
  const reader = raw.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  const content = new TextDecoder().decode(combined);

  const headerEnd = content.indexOf("\r\n\r\n");
  if (headerEnd === -1) return { from: "", to: "", subject: "", textBody: content.trim() };

  const rawHeaders = content.substring(0, headerEnd);
  const body = content.substring(headerEnd + 4);

  const from = extractHeader(rawHeaders, "From") || "";
  const to = extractHeader(rawHeaders, "To") || "";
  const subject = extractHeader(rawHeaders, "Subject") || "";
  const contentType = extractHeader(rawHeaders, "Content-Type") || "text/plain";

  const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/);
  if (boundaryMatch) {
    const { textBody, htmlBody } = parseMultipartBody(body, boundaryMatch[1]);
    return { from, to, subject, textBody, htmlBody };
  }

  if (contentType.includes("text/html")) {
    return { from, to, subject, textBody: body.trim(), htmlBody: body.trim() };
  }

  return { from, to, subject, textBody: body.trim() };
}

function parseMultipartBody(body: string, boundary: string): { textBody: string; htmlBody?: string } {
  const parts = body.split(`--${boundary}`).filter((p) => {
    const trimmed = p.trim();
    return trimmed !== "" && trimmed !== "--";
  });

  let textBody = "";
  let htmlBody: string | undefined;

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const partHeaders = part.substring(0, headerEnd);
    let partBody = part.substring(headerEnd + 4);

    partBody = partBody.replace(/--\s*$/, "").trim();

    const encoding = extractHeader(partHeaders, "Content-Transfer-Encoding") || "";
    const partContentType = extractHeader(partHeaders, "Content-Type") || "";

    let decoded = partBody;
    if (encoding.toLowerCase() === "base64") {
      try {
        decoded = atob(partBody.replace(/\s/g, ""));
      } catch {
        decoded = partBody;
      }
    } else if (encoding.toLowerCase() === "quoted-printable") {
      decoded = partBody
        .replace(/=(?:\r\n|\n)/g, "")
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }

    if (partContentType.includes("text/plain")) {
      textBody = decoded;
    } else if (partContentType.includes("text/html")) {
      htmlBody = decoded;
    }
  }

  return { textBody, htmlBody };
}

async function getSession(kv: KVNamespace, sessionId: string): Promise<EmailSession | null> {
  const raw = await kv.get(KV_KEYS.session(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EmailSession;
  } catch {
    return null;
  }
}

function buildEmailAddress(sessionId: string, domain: string): string {
  return `${sessionId}@${EMAIL_DOMAIN_PREFIX}.${domain}`;
}

function extractSessionIdFromAddress(address: string, domain: string): string | null {
  const expectedSuffix = `@${EMAIL_DOMAIN_PREFIX}.${domain}`;
  const lower = address.toLowerCase().trim().replace(/^<|>$/g, "");
  if (!lower.endsWith(expectedSuffix)) return null;
  const localPart = lower.slice(0, -expectedSuffix.length);
  return localPart || null;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const sessionId = extractSessionIdFromAddress(message.to, env.FORGE_DOMAIN);
    if (!sessionId || !isValidSessionId(sessionId)) {
      console.warn(`Unroutable email to ${message.to} (sessionId: ${sessionId})`);
      return;
    }

    const parsed = await parseEmail(message.raw);

    const emailMessage: EmailMessage = {
      from: parsed.from,
      to: parsed.to,
      subject: parsed.subject,
      textBody: parsed.textBody,
      ...(parsed.htmlBody ? { htmlBody: parsed.htmlBody } : {}),
      receivedAt: new Date().toISOString(),
    };

    const session = await getSession(env.DESIGN_DNA_EMAIL_KV, sessionId);

    if (session) {
      session.messages.push(emailMessage);
      await env.DESIGN_DNA_EMAIL_KV.put(KV_KEYS.session(sessionId), JSON.stringify(session));
    } else {
      const newSession: EmailSession = {
        sessionId,
        email: buildEmailAddress(sessionId, env.FORGE_DOMAIN),
        createdAt: new Date().toISOString(),
        messages: [emailMessage],
      };
      await env.DESIGN_DNA_EMAIL_KV.put(KV_KEYS.session(sessionId), JSON.stringify(newSession));
      await env.DESIGN_DNA_EMAIL_KV.put(KV_KEYS.email(newSession.email), sessionId);
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "POST" && path === "/api/sessions") {
        const domain = env.FORGE_DOMAIN;
        const sessionId = crypto.randomUUID();
        const email = buildEmailAddress(sessionId, domain);
        const newSession: EmailSession = {
          sessionId,
          email,
          createdAt: new Date().toISOString(),
          messages: [],
        };
        await env.DESIGN_DNA_EMAIL_KV.put(KV_KEYS.session(sessionId), JSON.stringify(newSession));
        await env.DESIGN_DNA_EMAIL_KV.put(KV_KEYS.email(email), sessionId);

        return jsonResponse({ sessionId, email }, 201);
      }

      const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
      const waitMatch = path.match(/^\/api\/sessions\/([^/]+)\/wait$/);

      if (sessionMatch) {
        const sessionId = sessionMatch[1];
        if (!isValidSessionId(sessionId)) {
          return errorResponse("Invalid session ID format", 400);
        }

        if (request.method === "GET") {
          const session = await getSession(env.DESIGN_DNA_EMAIL_KV, sessionId);
          if (!session) return errorResponse("Session not found", 404);
          return jsonResponse(session);
        }

        if (request.method === "DELETE") {
          const session = await getSession(env.DESIGN_DNA_EMAIL_KV, sessionId);
          if (!session) return errorResponse("Session not found", 404);

          await env.DESIGN_DNA_EMAIL_KV.delete(KV_KEYS.email(session.email));
          await env.DESIGN_DNA_EMAIL_KV.delete(KV_KEYS.session(sessionId));

          return jsonResponse({ deleted: true });
        }

        return errorResponse("Method not allowed", 405);
      }

      if (waitMatch) {
        if (request.method !== "GET") return errorResponse("Method not allowed", 405);

        const sessionId = waitMatch[1];
        if (!isValidSessionId(sessionId)) {
          return errorResponse("Invalid session ID format", 400);
        }

        const session = await getSession(env.DESIGN_DNA_EMAIL_KV, sessionId);
        if (!session) return errorResponse("Session not found", 404);

        const initialCount = session.messages.length;
        const deadline = Date.now() + WAIT_TIMEOUT_MS;

        while (Date.now() < deadline) {
          const remaining = deadline - Date.now();
          const delay = Math.min(WAIT_POLL_INTERVAL_MS, remaining);
          if (delay <= 0) break;

          await new Promise((resolve) => setTimeout(resolve, delay));

          const updated = await getSession(env.DESIGN_DNA_EMAIL_KV, sessionId);
          if (updated && updated.messages.length > initialCount) {
            const newMessages = updated.messages.slice(initialCount);
            return jsonResponse({ messages: newMessages });
          }
        }

        return jsonResponse({ messages: [] });
      }

      return errorResponse("Not found", 404);
    } catch (err) {
      console.error("Unhandled error:", err);
      return errorResponse("Internal server error", 500);
    }
  },
};
