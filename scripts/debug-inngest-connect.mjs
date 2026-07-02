#!/usr/bin/env node
import { Inngest } from "inngest";
import { connect } from "inngest/connect";

const logger = {
  debug: (...args) => console.log("[debug]", ...args),
  info: (...args) => console.log("[info]", ...args),
  warn: (...args) => console.warn("[warn]", ...args),
  error: (...args) => console.error("[error]", ...args),
};

const inngest = new Inngest({ id: "dreaming-doing", isDev: false, logger });
const ping = inngest.createFunction(
  { id: "connect-ping", triggers: [{ event: "debug/connect.ping" }] },
  async () => ({ ok: true }),
);

console.log("signingKey", inngest.signingKey ? "set" : "missing");
console.log("eventKey", inngest.eventKey ? "set" : "missing");

try {
  const connection = await Promise.race([
    connect({
      apps: [{ client: inngest, functions: [ping] }],
      instanceId: process.env.WORKER_INSTANCE_ID ?? "debug-local",
      maxWorkerConcurrency: 1,
      isolateExecution: false,
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("connect timeout 20s")), 20000),
    ),
  ]);
  console.log("connected", connection.state);
  await connection.close();
  console.log("closed ok");
} catch (err) {
  console.error("connect failed:", err?.message ?? err);
  if (err?.cause) console.error("cause:", err.cause);
  process.exit(1);
}