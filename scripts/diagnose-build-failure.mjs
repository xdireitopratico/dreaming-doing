#!/usr/bin/env node
/**
 * Diagnóstico: o que está quebrando o build do Vibe Code?
 *
 * Estratégia read-only sobre o Supabase:
 * 1. Lista projects existentes.
 * 2. Lista as últimas 30 agent_runs (todos os status).
 * 3. Para cada run failed/expired nas últimas 24h, lê:
 *    - agent_runs.error
 *    - agent_runs.meta (resumido)
 *    - últimos 10 agent_stream_events (procura validate_fail / model_error)
 * 4. Tenta achar 1 run com agent_stream_events > 5 que falhou
 *    e imprime o output do build para inspeção.
 *
 * Não muta nada.
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
    let val = t.slice(i + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[t.slice(0, i)] = val;
  }
  return env;
}

const env = loadEnvLocal();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function safeStr(v, max = 400) {
  if (v == null) return null;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…[trunc " + (s.length - max) + "]" : s;
}

async function main() {
  console.log("=== DIAGNÓSTICO: VIBE CODE BUILD FAILURE ===\n");

  // 1. Projects
  console.log("[1] Listando projetos (últimos 5)…");
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id, name, template, owner_id, created_at, meta")
    .order("created_at", { ascending: false })
    .limit(5);
  if (pErr) {
    console.error("Erro listando projects:", pErr.message);
  } else {
    for (const p of projects ?? []) {
      console.log(`  - ${p.name} (${p.id}) template=${p.template} created=${p.created_at}`);
    }
  }

  // 2. Recent agent_runs
  console.log("\n[2] Últimas 30 agent_runs…");
  const { data: runs, error: rErr } = await supabase
    .from("agent_runs")
    .select("id, project_id, conversation_id, status, error, started_at, finished_at, steps, meta")
    .order("started_at", { ascending: false })
    .limit(30);
  if (rErr) {
    console.error("Erro listando runs:", rErr.message);
    return;
  }
  const statusCount = {};
  for (const r of runs ?? []) {
    statusCount[r.status] = (statusCount[r.status] ?? 0) + 1;
  }
  console.log("  Distribuição:", statusCount);
  for (const r of runs ?? []) {
    const meta = (r.meta ?? {});
    const m = {
      mode: meta.mode,
      provider: meta.provider,
      model: meta.model,
      hasCheckpoint: meta.checkpoint === true,
      resumableExhausted: meta.resumableExhausted === true,
      staleExpired: meta.staleExpired === true,
      buildFix: meta.buildFix === true,
    };
    console.log(
      `  - ${r.id.slice(0, 8)} status=${r.status} steps=${r.steps ?? "?"} started=${r.started_at} error=${safeStr(r.error, 120)}`,
    );
    console.log(`    meta:`, JSON.stringify(m));
  }

  // 3. Para cada run failed ou completed nas últimas 24h, lê os eventos
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const interesting = (runs ?? []).filter(
    (r) =>
      (r.status === "failed" || r.status === "completed") &&
      r.started_at &&
      r.started_at > cutoff,
  );

  console.log(`\n[3] ${interesting.length} runs failed/completed nas últimas 24h. Investigando cada um…\n`);

  for (const r of interesting.slice(0, 5)) {
    console.log(`\n--- Run ${r.id.slice(0, 8)} (${r.status}, ${r.steps ?? 0} steps) ---`);

    // Eventos
    const { data: events } = await supabase
      .from("agent_stream_events")
      .select("event_type, seq, created_at, payload")
      .eq("run_id", r.id)
      .order("seq", { ascending: true })
      .limit(500);

    const counts = {};
    let lastValidateFail = null;
    let lastBuildFeedback = null;
    let lastModelError = null;
    let firstAssistantText = null;
    for (const ev of events ?? []) {
      counts[ev.event_type] = (counts[ev.event_type] ?? 0) + 1;
      if (ev.event_type === "validate_fail") {
        lastValidateFail = ev;
      }
      if (ev.event_type === "validate_ok") {
        lastValidateFail = null;
      }
      if (ev.event_type === "model_error") {
        lastModelError = ev;
      }
      if (ev.event_type === "assistant_text" && !firstAssistantText) {
        firstAssistantText = ev;
      }
    }
    console.log("  Event counts:", JSON.stringify(counts));

    if (lastValidateFail) {
      const p = lastValidateFail.payload ?? {};
      console.log("\n  >>> validate_fail encontrado:");
      console.log("    attempt:", p.attempt);
      console.log("    checks:", JSON.stringify(p.checks));
      console.log("    feedback (primeiros 2000 chars):");
      console.log(
        "    " + String(p.feedback ?? "").slice(0, 2000).split("\n").join("\n    "),
      );
    } else {
      console.log("  Sem validate_fail explícito nos eventos.");
    }

    if (lastModelError) {
      const p = lastModelError.payload ?? {};
      console.log("\n  >>> model_error encontrado:");
      console.log("    " + safeStr(p, 1500));
    }

    if (firstAssistantText) {
      console.log(
        "\n  Primeira assistant_text (FASE 1?):",
        safeStr(firstAssistantText.payload, 400),
      );
    }

    // Mensagem final do assistant
    const { data: msgs } = await supabase
      .from("messages")
      .select("role, parts, meta, created_at")
      .eq("conversation_id", r.conversation_id)
      .order("created_at", { ascending: false })
      .limit(3);
    if (msgs) {
      console.log("\n  Últimas 3 mensagens da conversa:");
      for (const m of msgs) {
        const txt = Array.isArray(m.parts)
          ? m.parts.map((p) => p.text).join("\n").trim()
          : "";
        console.log(`    [${m.role}] ${safeStr(txt, 300)}`);
      }
    }
  }

  console.log("\n=== FIM DO DIAGNÓSTICO ===");
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
