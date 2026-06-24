import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DIST_HANDLER_URL = new URL("../dist/server/inngest-handler.js", import.meta.url);
const SRC_HANDLER_URL = new URL("../src/inngest/handler.ts", import.meta.url);

let handlerPromise;

async function resolveHandler() {
  try {
    await access(fileURLToPath(DIST_HANDLER_URL), constants.F_OK);
    const mod = await import(/* @vite-ignore */ DIST_HANDLER_URL.href);
    return mod.inngestHandler;
  } catch {
    const mod = await import(/* @vite-ignore */ SRC_HANDLER_URL.href);
    return mod.inngestHandler;
  }
}

function getHandler() {
  handlerPromise ??= resolveHandler();
  return handlerPromise;
}

function buildRequestUrl(req) {
  const raw = req.url ?? "/api/inngest";
  if (typeof raw === "string" && (raw.startsWith("http://") || raw.startsWith("https://"))) {
    return raw;
  }
  const host = req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const path = String(raw).startsWith("/") ? String(raw) : `/${raw}`;
  return `${proto}://${host}${path}`;
}

export default async function inngestHandler(req, res) {
  const handler = await getHandler();
  const host =
    req.headers["x-forwarded-host"] ||
    req.headers["host"] ||
    process.env.VERCEL_URL ||
    "dreaming-doing.vercel.app";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const url = buildRequestUrl(req);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
  }
  // Inngest: new URL(req.url, `https://${host}`) — host vazio => base "https://" => crash
  headers.set("host", String(host).split(",")[0].trim());

  const request = new Request(url, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });

  const response = await handler(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      res.appendHeader("Set-Cookie", value);
    } else {
      res.setHeader(key, value);
    }
  });

  if (response.body) {
    const reader = response.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(value);
      await pump();
    };
    await pump();
  } else {
    res.end();
  }
}
