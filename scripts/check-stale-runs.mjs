#!/usr/bin/env node
/**
 * Lista runs zumbis (running/pending > 15 min) e sai com código 1 se houver.
 * Ignora handoff entre chunks (betweenChunks / chunk_resume recente).
 *
 * Usage: node scripts/check-stale-runs.mjs [--project-id=UUID]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shouldSkipStaleExpiry } from "./lib/stale-run-filter.mjs";

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
const STALE_MS = 15 * 60 * 1000;

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const projectId = arg("project-id");
const cutoff = new Date(Date.now() - STALE_MS).toISOString();

function restHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };
}

async function lastStreamEvent(runId) {
  const url = `${SUPABASE_URL}/rest/v1/agent_stream_events?run_id=eq.${runId}&select=event_type,created_at&order=seq.desc&limit=1`;
  const res = await fetch(url, { headers: restHeaders() });
  const rows = await res.json();
  if (!res.ok || !rows?.[0]) return { lastEventType: null, lastEventAt: null };
  return {
    lastEventType: rows[0].event_type ?? null,
    lastEventAt: rows[0].created_at ?? null,
  };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("FAIL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  let url = `${SUPABASE_URL}/rest/v1/agent_runs?status=in.(running,pending)&started_at=lt.${cutoff}&select=id,project_id,status,started_at,error,meta&order=started_at.asc`;
  if (projectId) {
    url += `&project_id=eq.${projectId}`;
  }

  const res = await fetch(url, { headers: restHeaders() });
  const rows = await res.json();
  if (!res.ok) {
    console.error("FAIL: query", res.status, JSON.stringify(rows));
    process.exit(1);
  }

  const stale = [];
  for (const r of rows ?? []) {
    const meta = r.meta && typeof r.meta === "object" ? r.meta : {};
    const { lastEventType, lastEventAt } = await lastStreamEvent(r.id);
    if (
      shouldSkipStaleExpiry({
        meta,
        lastEventType,
        lastEventAt,
      })
    ) {
      continue;
    }
    stale.push(r);
  }

  if (!stale.length) {
    const skipped = (rows?.length ?? 0) - stale.length;
    if (skipped > 0) {
      console.log(`OK: 0 stale runs (${skipped} em handoff entre chunks ignorada(s))`);
    } else {
      console.log("OK: 0 stale runs");
    }
    process.exit(0);
  }

  console.error(`STALE RUNS (${stale.length}):`);
  for (const r of stale) {
    console.error(`  ${r.id} project=${r.project_id} status=${r.status} started=${r.started_at}`);
  }
  console.error("\nCleanup SQL (substitua PROJECT_ID):");
  console.error(
    `UPDATE agent_runs SET status='failed', finished_at=now(), error='manual cleanup' WHERE project_id='PROJECT_ID' AND status IN ('running','pending');`,
  );
  process.exit(1);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});