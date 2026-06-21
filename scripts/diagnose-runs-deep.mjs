#!/usr/bin/env node
/**
 * Diagnóstico 3: pega os agent_stream_events das runs que falharam
 * e imprime TUDO: tool_done outputs, validate_fail feedback, etc.
 *
 * Foco: a run 53bd4f5d (Qwen3.5, "Build não passou após 3 tentativas")
 * e a b4d751d4 (Nemotron, exit status 127).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(p, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).replace(/^["']|["']$/g, "");
    env[t.slice(0, i)] = v;
  }
  return env;
}

const env = loadEnvLocal();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const RUNS = [
  "53bd4f5d", // Qwen3.5, "Build não passou após 3 tentativas"
  "b4d751d4", // Nemotron, exit status 127 (stale)
  "f890505b", // Qwen3.5, "Limite de iterações"
  "1dbc5f90", // Qwen3.5, "Limite de iterações"
  "6420042c", // Qwen3.5, "Resposta sem tool nem texto"
];

async function inspectRun(shortId) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`RUN ${shortId}...`);
  console.log("=".repeat(80));

  // Encontra a run com esse prefixo curto
  const { data: candidates } = await supabase
    .from("agent_runs")
    .select("id")
    .limit(100);
  const found = candidates?.find((r) => r.id.startsWith(shortId));
  if (!found) {
    console.log("  Não encontrado.");
    return;
  }
  const { data: run } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("id", found.id)
    .maybeSingle();
  if (!run) {
    console.log("  Não encontrado após lookup.");
    return;
  }
  console.log(`  status=${run.status} steps=${run.steps} started=${run.started_at}`);
  console.log(`  error:`, run.error);

  const { data: events } = await supabase
    .from("agent_stream_events")
    .select("*")
    .eq("run_id", run.id)
    .order("seq", { ascending: true });

  console.log(`\n  ${events?.length ?? 0} eventos:`);
  for (const ev of events ?? []) {
    const p = ev.payload || {};
    if (ev.event_type === "validate_fail") {
      console.log(`\n    [${ev.seq}] ${ev.event_type} attempt=${p.attempt}`);
      console.log(`        checks: ${JSON.stringify(p.checks)}`);
      console.log(`        feedback:`);
      const fb = String(p.feedback ?? "");
      console.log(fb.split("\n").map((l) => "          " + l).join("\n"));
    } else if (ev.event_type === "tool_done") {
      console.log(
        `\n    [${ev.seq}] ${ev.event_type} name=${p.name} ok=${p.ok} exitCode=${p.exitCode}`,
      );
      if (p.stdout) {
        const s = String(p.stdout).slice(-1500);
        console.log("        stdout (last 1500):");
        console.log(s.split("\n").map((l) => "          " + l).join("\n"));
      }
      if (p.stderr) {
        const s = String(p.stderr).slice(-1500);
        console.log("        stderr (last 1500):");
        console.log(s.split("\n").map((l) => "          " + l).join("\n"));
      }
    } else if (ev.event_type === "model_error") {
      console.log(`\n    [${ev.seq}] ${ev.event_type}: ${JSON.stringify(p).slice(0, 1000)}`);
    } else if (ev.event_type === "assistant_text") {
      const txt = String(p.text ?? "").slice(0, 200);
      console.log(`\n    [${ev.seq}] assistant_text: ${txt}${txt.length >= 200 ? "..." : ""}`);
    } else if (ev.event_type === "tool_start") {
      console.log(`\n    [${ev.seq}] tool_start: ${p.name}(${JSON.stringify(p.arguments ?? {}).slice(0, 200)})`);
    } else if (ev.event_type === "start" || ev.event_type === "finish") {
      console.log(`\n    [${ev.seq}] ${ev.event_type}: ${JSON.stringify(p).slice(0, 500)}`);
    } else if (ev.event_type === "delivery_checkpoint" || ev.event_type === "fsm_transition" || ev.event_type === "phase") {
      console.log(`\n    [${ev.seq}] ${ev.event_type}: ${JSON.stringify(p).slice(0, 300)}`);
    } else {
      console.log(`\n    [${ev.seq}] ${ev.event_type}: ${JSON.stringify(p).slice(0, 200)}`);
    }
  }
}

for (const id of RUNS) {
  await inspectRun(id);
}

console.log(`\n${"=".repeat(80)}`);
console.log("FIM");
