let handler;

async function loadHandler() {
  if (handler) return handler;
  const mod = await import("../dist/server/vercel-entry.js");
  handler = mod.default ?? mod;
  return handler;
}

function defaultErrorResponse() {
  return "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Server Error</title>" +
    "<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;" +
    "height:100vh;margin:0;background:#0a0a0a;color:#fafafa}h1{font-size:2rem}</style></head>" +
    "<body><h1>500 — Internal Server Error</h1></body></html>";
}

export default async function serverless(req, res) {
  try {
    const { fetch } = await loadHandler();

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["host"] || "localhost";
    const url = `${protocol}://${host}${req.url}`;

    const body =
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await readBody(req);

    const request = new Request(url, {
      method: req.method,
      headers: filterHeaders(req.headers),
      body,
    });

    const response = await fetch(request);

    res.statusCode = response.status;
    for (const [key, value] of response.headers) {
      if (key.toLowerCase() === "set-cookie") {
        res.appendHeader("Set-Cookie", value);
      } else {
        res.setHeader(key, value);
      }
    }

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
  } catch (error) {
    console.error("[vercel-server]", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(defaultErrorResponse());
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function filterHeaders(headers) {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value != null) {
      if (Array.isArray(value)) {
        result.set(key, value.join(", "));
      } else {
        result.set(key, String(value));
      }
    }
  }
  return result;
}
