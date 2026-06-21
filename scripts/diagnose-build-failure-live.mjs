#!/usr/bin/env node
/**
 * Diagnóstico 2: dispara 1 run de teste em um projeto mínimo e captura
 * o erro real do build (sem mutar nada além do necessário para o teste).
 *
 * Estratégia:
 * 1. Cria um projeto de teste com template vite-react (cria 30+ arquivos via seed).
 * 2. Envia mensagem "Crie um botão azul" via agent-run.
 * 3. Aguarda 90s.
 * 4. Lê o agent_runs.error + agent_stream_events (último validate_fail).
 * 5. Imprime tudo.
 * 6. NÃO deleta o projeto (deixa rastro pra você inspecionar).
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

// IMPORTANTE: usar as credenciais VITE do app pra o user_id bater.
const ANON = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function safeStr(v, max = 600) {
  if (v == null) return null;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…[trunc " + (s.length - max) + "]" : s;
}

async function main() {
  console.log("=== DIAGNÓSTICO 2: REPRODUZINDO BUILD FAIL ===\n");

  // 1. Pega o primeiro profile (admin)
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .limit(5);
  console.log("[1] Profiles encontrados:");
  for (const p of profiles ?? []) {
    console.log(`  - ${p.id} name=${p.display_name}`);
  }
  const userId = profiles?.[0]?.id;
  if (!userId) {
    console.error("Nenhum profile encontrado. Abortando.");
    return;
  }

  // 2. Cria projeto de teste
  const projName = `[DIAG] build-failure-${Date.now()}`;
  const projSlug = `diag-build-failure-${Date.now().toString(36)}`;
  console.log(`\n[2] Criando projeto "${projName}"…`);
  const { data: project, error: pErr } = await supabase
    .from("projects")
    .insert({
      owner_id: userId,
      name: projName,
      slug: projSlug,
      template: "vite-react",
      meta: { diagnostic: true },
    })
    .select()
    .single();
  if (pErr || !project) {
    console.error("Erro criando projeto:", pErr?.message);
    return;
  }
  console.log(`  ✓ Projeto criado: ${project.id}`);

  // 3. Cria conversation
  const { data: conv, error: cErr } = await supabase
    .from("conversations")
    .insert({
      project_id: project.id,
      title: "diagnóstico build failure",
    })
    .select()
    .single();
  if (cErr || !conv) {
    console.error("Erro criando conversation:", cErr?.message);
    return;
  }
  console.log(`  ✓ Conversation: ${conv.id}`);

  // 4. Insere user message
  const userMsg = "Crie um botão azul centralizado na página principal. Não mude mais nada.";
  const { data: msg } = await supabase
    .from("messages")
    .insert({
      conversation_id: conv.id,
      role: "user",
      parts: [{ type: "text", text: userMsg }],
      meta: { mode: "build" },
    })
    .select()
    .single();
  console.log(`  ✓ Mensagem inserida: ${msg.id}`);

  // 5. Dispara agent-run via Edge Function
  console.log("\n[3] Disparando agent-run…");
  const { data: fnData, error: fnErr } = await supabase.functions.invoke("agent-run", {
    body: {
      projectId: project.id,
      conversationId: conv.id,
      sessionKind: "byok",
      mode: "build",
      preferences: {
        mode: "fixed",
        fixedPresetId: "nvidia/qwen3.5-397b-a17b",
      },
    },
  });
  if (fnErr) {
    console.error("Erro agent-run:", fnErr);
    return;
  }
  console.log("  Resposta:", JSON.stringify(fnData, null, 2));
  const runId = fnData?.runId;
  if (!runId) {
    console.error("Sem runId. Abortando.");
    return;
  }

  // 6. Aguarda 90s
  console.log(`\n[4] Aguardando 90s (runId=${runId.slice(0, 8)})…`);
  await new Promise((r) => setTimeout(r, 90_000));

  // 7. Lê o estado final
  console.log("\n[5] Lendo estado final…");
  const { data: finalRun } = await supabase
    .from("agent_runs")
    .select("id, status, error, steps, started_at, finished_at, meta")
    .eq("id", runId)
    .single();
  console.log("  Run final:", JSON.stringify(finalRun, null, 2));

  // 8. Eventos
  const { data: events } = await supabase
    .from("agent_stream_events")
    .select("event_type, seq, created_at, payload")
    .eq("run_id", runId)
    .order("seq", { ascending: true })
    .limit(500);

  const counts = {};
  let lastValidateFail = null;
  let firstAssistant = null;
  for (const ev of events ?? []) {
    counts[ev.event_type] = (counts[ev.event_type] ?? 0) + 1;
    if (ev.event_type === "validate_fail") lastValidateFail = ev;
    if (ev.event_type === "assistant_text" && !firstAssistant) firstAssistant = ev;
  }
  console.log("\n[6] Event counts:", JSON.stringify(counts));

  if (firstAssistant) {
    console.log("\n[FASE 1 / primeira assistant_text]:");
    console.log("  ", safeStr(firstAssistant.payload, 1000));
  }

  if (lastValidateFail) {
    console.log("\n[VALIDATE_FAIL]:");
    console.log("  attempt:", lastValidateFail.payload?.attempt);
    console.log("  checks:", JSON.stringify(lastValidateFail.payload?.checks));
    console.log("  feedback:");
    console.log("  " + String(lastValidateFail.payload?.feedback ?? "").split("\n").join("\n  "));
  } else {
    console.log("\n[VALIDATE_FAIL] Nenhum validate_fail nos eventos.");
  }

  // 9. Mensagens finais
  const { data: finalMsgs } = await supabase
    .from("messages")
    .select("role, parts, meta, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });
  console.log("\n[MENSAGENS DA CONVERSA]:");
  for (const m of finalMsgs ?? []) {
    const txt = Array.isArray(m.parts) ? m.parts.map((p) => p.text).join("\n").trim() : "";
    console.log(`  [${m.role}] ${safeStr(txt, 800)}`);
  }

  console.log("\n=== FIM DO DIAGNÓSTICO ===");
  console.log(`Projeto de teste: ${project.id} (não foi deletado)`);
  console.log(`Conversation: ${conv.id}`);
  console.log(`Run: ${runId}`);
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
