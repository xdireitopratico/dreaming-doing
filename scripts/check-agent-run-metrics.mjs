#!/usr/bin/env node
/**
 * Métricas de agent_runs — últimos N dias (default 7).
 * Exit 1 se failed_rate > threshold (default 25%) entre runs terminais.
 * Reporta running/pending separados (não entram no denominador de failed rate).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    /* optional */
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DAYS = Number(process.env.AGENT_METRICS_DAYS ?? "7");
const THRESHOLD = Number(process.env.AGENT_FAILED_THRESHOLD_PCT ?? "25");
const ACTIVE_WARN = Number(process.env.AGENT_ACTIVE_WARN_COUNT ?? "20");

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const days = Number(arg("days") ?? DAYS);
const threshold = Number(arg("threshold") ?? THRESHOLD);
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("FAIL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const url =
    `${SUPABASE_URL}/rest/v1/agent_runs?started_at=gte.${cutoff}` +
    `&select=status&order=started_at.desc`;

  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    console.error(`FAIL: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const rows = await res.json();
  const counts = {};
  for (const row of rows) {
    const s = row.status ?? "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }

  const terminal = ["completed", "failed", "canceled"];
  const terminalTotal = terminal.reduce((n, s) => n + (counts[s] ?? 0), 0);
  const failed = counts.failed ?? 0;
  const completed = counts.completed ?? 0;
  const active = (counts.running ?? 0) + (counts.pending ?? 0);
  const awaiting = counts.awaiting_user ?? 0;
  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  const failedRate = terminalTotal > 0 ? (failed / terminalTotal) * 100 : 0;
  const activeShare = total > 0 ? (active / total) * 100 : 0;

  console.log(`=== Agent runs (${days}d, since ${cutoff.slice(0, 10)}) ===`);
  console.log(JSON.stringify(counts, null, 2));
  console.log(`Total: ${total}`);
  console.log(`Active (excl. do failed rate): running+pending=${active}, awaiting_user=${awaiting}`);
  console.log(`Terminal: ${terminalTotal} (completed=${completed}, failed=${failed})`);
  console.log(`Failed rate (terminal only): ${failedRate.toFixed(1)}% (threshold ${threshold}%)`);
  console.log(`Active share of window: ${activeShare.toFixed(1)}%`);

  if (active >= ACTIVE_WARN) {
    console.warn(
      `WARN: ${active} active runs — verifique check:stale-runs (handoff entre chunks é ignorado)`,
    );
  }

  if (terminalTotal === 0) {
    console.log("WARN: no terminal runs in window — failed rate não calculável");
    process.exit(0);
  }

  if (failedRate > threshold) {
    console.error(`FAIL: failed rate ${failedRate.toFixed(1)}% > ${threshold}%`);
    process.exit(1);
  }

  console.log("OK: failed rate within threshold");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});