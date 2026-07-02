import { createServer } from "node:http";
import { connect, ConnectionState } from "inngest/connect";
import { inngest } from "./client";
import { inngestFunctions } from "./index";

const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? "8081");
const maxConcurrency = Number(
  process.env.INNGEST_CONNECT_MAX_WORKER_CONCURRENCY ?? "5",
);

async function main() {
  const connection = await connect({
    apps: [{ client: inngest, functions: inngestFunctions }],
    instanceId: process.env.WORKER_INSTANCE_ID ?? process.env.HOSTNAME,
    maxWorkerConcurrency: maxConcurrency,
  });

  console.log("[dd-worker] connected", connection.state);

  const httpServer = createServer((req, res) => {
    if (req.url === "/ready" || req.url === "/health") {
      if (connection.state === ConnectionState.ACTIVE) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      } else {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("NOT READY");
      }
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("NOT FOUND");
  });

  httpServer.listen(HEALTH_PORT, () => {
    console.log(`[dd-worker] health on :${HEALTH_PORT}`);
  });

  await connection.closed;
  httpServer.close();
  console.log("[dd-worker] shutdown complete");
}

main().catch((err) => {
  console.error("[dd-worker] fatal", err);
  process.exit(1);
});