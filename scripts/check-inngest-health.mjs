#!/usr/bin/env node
/**
 * Visibilidade permanente: Inngest event URL + worker Vercel + últimas runs smoke.
 *
 * Usage: npm run check:inngest
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveInngestEventConfig } from "./lib/inngest-event-url.mjs";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
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
  } catch {
    // optional
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SERVE_ORIGIN =
  process.env.INNGEST_SERVE_ORIGIN ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://dreaming-doing.vercel.app");
const SERVE_PATH = "/api/inngest";
const BYPASS = process.env.INNGEST_VERCEL_DEPLOYMENT_PROTECTION_KEY ?? "";

async function probeServe() {
  const url = `${SERVE_ORIGIN.replace(/\/$/, "")}${SERVE_PATH.startsWith("/") ? SERVE_PATH : `/${SERVE_PATH}`}`;
  const headers = {};
  if (BYPASS) headers["x-vercel-protection-bypass"] = BYPASS;

  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not json
  }
  return { url, status: res.status, json, text: text.slice(0, 400) };
}

async function probeEventSend(eventUrl) {
  if (!eventUrl) return { ok: false, error: "dispatch URL missing" };

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
  console.log("=== Inngest health ===\n");

  const cfg = resolveInngestEventConfig();
  console.log("Webhook URL (visibilidade):", cfg.webhookUrl ?? "(not configured)");
  console.log("Event key URL (worker):", cfg.eventKeyUrl ?? "(not configured)");
  console.log("Dispatch URL (usada):", cfg.dispatchUrl ?? "(not configured)");
  if (cfg.keyMismatch) {
    console.log(
      "⚠ KEY MISMATCH: INNGEST_WEBHOOK e INNGEST_EVENT_KEY são apps diferentes — dispatch usa event key",
    );
    console.log(
      "  → Para unificar: copie o Signing Key do app do webhook para INNGEST_SIGNING_KEY na Vercel",
    );
  }
  console.log("Serve URL:", `${SERVE_ORIGIN}${SERVE_PATH}`);

  const serve = await probeServe();
  console.log("\nWorker serve GET:", serve.status);
  if (serve.json) {
    console.log("  mode:", serve.json.mode);
    console.log("  functions:", serve.json.function_count);
    console.log("  signing_key:", serve.json.has_signing_key);
  } else if (serve.status !== 200) {
    console.log("  body:", serve.text);
  }

  const ping = await probeEventSend(cfg.dispatchUrl);
  console.log("\nEvent ingest POST:", ping.ok ? "ok" : "FAIL", ping.status ?? "");
  if (!ping.ok) console.log("  error:", ping.error ?? ping.body);

  const runs = await recentSmokeRuns();
  if (runs.length) {
    console.log("\nRecent smoke runs:");
    for (const r of runs) {
      console.log(`  ${r.id?.slice(0, 8)} ${r.status} ${r.error ?? ""}`);
    }
    const stuckPending = runs.filter((r) => r.status === "pending");
    if (stuckPending.length) {
      console.log(
        `  ⚠ ${stuckPending.length} smoke run(s) stuck pending — verifique key mismatch ou sync Inngest`,
      );
    }
  }

  const workerAlive =
    serve.status === 200 ||
    (serve.status === 401 && !serve.text.includes("FUNCTION_INVOCATION_FAILED"));
  const healthy = workerAlive && ping.ok && !cfg.keyMismatch;

  if (!healthy) {
    console.error("\nFAIL: Inngest pipeline unhealthy");
    if (!workerAlive) console.error("  → worker /api/inngest must return 200 or 401 (not 500)");
    if (!ping.ok) console.error("  → event ingest failed — check INNGEST_EVENT_KEY / INNGEST_WEBHOOK");
    if (cfg.keyMismatch) {
      console.error(
        "  → INNGEST_WEBHOOK ≠ INNGEST_EVENT_KEY — eventos no webhook não chegam ao worker Vercel",
      );
    }
    process.exit(1);
  }
  console.log(
    "\nOK: Inngest event ingest + worker alive",
    serve.status === 401 ? "(401 = signing required in prod)" : "",
  );
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});