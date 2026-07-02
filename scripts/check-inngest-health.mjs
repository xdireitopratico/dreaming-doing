#!/usr/bin/env node
/**
 * Inngest health: event ingest + connect workers na VM Hostinger.
 *
 * Usage: npm run check:inngest
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { resolveInngestEventUrl } from "./lib/inngest-event-url.mjs";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i);
    let val = t.slice(i + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(homedir(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const VM_HOST = process.env.HOSTINGER_VM_HOST ?? process.env.VM_HOST ?? "187.77.239.8";
const WORKER_PORTS = (process.env.INNGEST_WORKER_PORTS ?? "8081,8082")
  .split(",")
  .map((p) => Number(p.trim()))
  .filter((p) => !Number.isNaN(p));

async function probeVmWorkers() {
  const results = [];
  for (const port of WORKER_PORTS) {
    const url = `http://${VM_HOST}:${port}/ready`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const text = await res.text();
      results.push({ port, ok: res.ok && text.trim() === "OK", status: res.status, body: text.slice(0, 40) });
    } catch (err) {
      results.push({
        port,
        ok: false,
        status: 0,
        body: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

async function probeVercelServeDisabled() {
  const origin =
    process.env.INNGEST_SERVE_ORIGIN ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://dreaming-doing.vercel.app");
  const bypass = process.env.INNGEST_VERCEL_DEPLOYMENT_PROTECTION_KEY ?? "";
  const headers = {};
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const res = await fetch(`${origin.replace(/\/$/, "")}/api/inngest`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(12000),
  });
  const text = await res.text();
  return { status: res.status, disabled: res.status === 410, body: text.slice(0, 200) };
}

async function probeEventSend() {
  const eventUrl = resolveInngestEventUrl();
  if (!eventUrl) return { ok: false, error: "INNGEST_EVENT_KEY missing" };

  const res = await fetch(eventUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "agent/health.ping",
      data: { ts: Date.now(), source: "check-inngest-health" },
      ts: Date.now(),
    }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 200), eventUrl };
}

async function recentSmokeRuns() {
  if (!SUPABASE_URL || !SERVICE_KEY) return [];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_runs?meta->>smoke=eq.true&select=id,status,error,started_at&order=started_at.desc&limit=5`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    },
  );
  if (!res.ok) return [];
  return res.json();
}

async function main() {
  console.log("=== Inngest health (VM connect) ===\n");

  const eventUrl = resolveInngestEventUrl();
  console.log("Event URL:", eventUrl ?? "(not configured — set INNGEST_EVENT_KEY)");
  console.log("VM workers:", VM_HOST, WORKER_PORTS.join(", "));

  const workers = await probeVmWorkers();
  for (const w of workers) {
    console.log(
      `\nWorker :${w.port}:`,
      w.ok ? "ready" : "FAIL",
      w.status || "",
      w.ok ? "" : w.body,
    );
  }

  const vercel = await probeVercelServeDisabled();
  console.log("\nVercel /api/inngest:", vercel.status, vercel.disabled ? "(disabled OK)" : "(should be 410)");

  const ping = await probeEventSend();
  console.log("\nEvent ingest POST:", ping.ok ? "ok" : "FAIL", ping.status ?? "");
  if (!ping.ok) console.log("  error:", ping.error ?? ping.body);

  const runs = await recentSmokeRuns();
  if (runs.length) {
    console.log("\nRecent smoke runs:");
    for (const r of runs) {
      console.log(`  ${r.id?.slice(0, 8)} ${r.status} ${r.error ?? ""}`);
    }
  }

  const readyCount = workers.filter((w) => w.ok).length;
  const workersOk = readyCount > 0;
  if (readyCount < workers.length) {
    console.log(`\n⚠ ${readyCount}/${workers.length} workers reachable externally (8082 pode estar firewalled)`);
  }
  const healthy = workersOk && ping.ok;

  if (!healthy) {
    console.error("\nFAIL: Inngest pipeline unhealthy");
    if (!workersOk) console.error("  → VM connect workers not ready (npm run deploy:vm-workers)");
    if (!ping.ok) console.error("  → event ingest failed — check INNGEST_EVENT_KEY");
    process.exit(1);
  }
  console.log("\nOK: event ingest + VM connect workers ready");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});