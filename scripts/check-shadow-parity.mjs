#!/usr/bin/env node
/**
 * Fase 1 exit gate — compara status terminal agent_runs vs último agent_jobs (shadow).
 * Só compara runs já terminais (ignora running/pending — chunk handoff em shadow).
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
const LIMIT = Number(process.env.SHADOW_PARITY_LIMIT ?? "100");

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

const limit = Number(arg("limit") ?? LIMIT);

const JOB_TO_RUN = {
  completed: "completed",
  failed: "failed",
  canceled: "canceled",
};

const TERMINAL_RUN = new Set(["completed", "failed", "canceled", "awaiting_user"]);

async function fetchJson(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("FAIL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const jobs = await fetchJson(
    `agent_jobs?select=run_id,generation,status,finished_at&order=finished_at.desc.nullslast&limit=${limit * 3}`,
  );

  const latestByRun = new Map();
  for (const job of jobs) {
    const runId = job.run_id;
    if (!runId || latestByRun.has(runId)) continue;
    if (!["completed", "failed", "canceled"].includes(job.status)) continue;
    latestByRun.set(runId, job);
    if (latestByRun.size >= limit) break;
  }

  const runtimeV2 = (process.env.AGENT_RUNTIME_V2 ?? "").trim().toLowerCase();
  const jobsExpected = runtimeV2 === "shadow" || runtimeV2 === "worker" || runtimeV2 === "1" || runtimeV2 === "true";

  if (latestByRun.size === 0) {
    if (jobsExpected) {
      console.error(
        "FAIL: AGENT_RUNTIME_V2 ativo mas sem agent_jobs terminais — shadow/worker não está gravando",
      );
      process.exit(1);
    }
    console.log("SKIP: shadow off (AGENT_RUNTIME_V2 unset) — nada para comparar");
    process.exit(0);
  }

  const runIds = [...latestByRun.keys()];
  const runs = await fetchJson(
    `agent_runs?id=in.(${runIds.join(",")})&select=id,status,finished_at`,
  );
  const runMap = new Map(runs.map((r) => [r.id, r]));

  const divergences = [];
  let compared = 0;
  let skippedActive = 0;

  for (const [runId, job] of latestByRun) {
    const run = runMap.get(runId);
    if (!run) {
      divergences.push({ runId, reason: "run_missing", jobStatus: job.status });
      continue;
    }
    if (!TERMINAL_RUN.has(run.status)) {
      skippedActive += 1;
      continue;
    }
    compared += 1;
    const expected = JOB_TO_RUN[job.status];
    if (run.status !== expected && !(run.status === "awaiting_user" && job.status === "completed")) {
      divergences.push({
        runId,
        runStatus: run.status,
        jobStatus: job.status,
        generation: job.generation,
      });
    }
  }

  console.log(
    `=== Shadow parity (${compared} terminal runs compared, ${skippedActive} active skipped) ===`,
  );

  if (divergences.length) {
    console.error(JSON.stringify(divergences.slice(0, 20), null, 2));
    console.error(`FAIL: ${divergences.length} divergence(s)`);
    process.exit(1);
  }

  if (compared === 0) {
    console.log("WARN: no terminal runs to compare yet");
    process.exit(0);
  }

  console.log(`OK: 0 terminal status divergences across ${compared} runs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});