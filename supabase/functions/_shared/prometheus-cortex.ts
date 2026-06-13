/**
 * prometheus-cortex.ts — Orchestrator FSM for Prometheus Builder
 *
 * SLIM: This file is the FSM router + session lifecycle only.
 * All domain logic lives in dedicated modules:
 *   - prometheus-db.ts          → DB client, insertTurn, updateSessionPhase
 *   - prometheus-deliberation.ts → Boardroom roundtable (multi-turn deliberation)
 *   - prometheus-pipeline.ts     → Post-approval phases (Scribe, Sentinel, Deploy)
 *   - prometheus-prompts.ts      → All system prompts
 *
 * Public API (consumed by prometheus-builder/index.ts):
 *   startSession, processMessage, getSessionStatus, summarizeSession
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { routeLLM } from "./llm-router.ts";
import { CORTEX_SYSTEM_PROMPT } from "./prometheus-prompts.ts";
import {
  runScribePhase,
  runSentinelPhase,
  deployFlow,
} from "./prometheus-pipeline.ts";
import {
  type ClarificationQuestion,
  type PrometheusPhase,
} from "./prometheus-types.ts";
import {
  supabaseAdmin,
  insertTurn,
  updateSessionPhase,
  getModelId,
  persistTokensUsed,
  sanitizeForPrompt,
} from "./prometheus-db.ts";
import { analyzeRequirements, sanitizeAnalystResult } from "./prometheus-analyst.ts";
import { generateArchitecture } from "./prometheus-architect.ts";
import { runSentinel, saveFlowToAgentFlows } from "./prometheus-sentinel.ts";
import { runBoardroomRoundtable, writeArchitectureToFlow } from "./prometheus-deliberation.ts";
import { runEnrichment } from "./prometheus-enrichment.ts";

// ═══ SESSION MANAGEMENT ═══

export async function startSession(
  userId: string,
  briefing: Record<string, unknown>,
  flowId?: string,
  modelId?: string,
): Promise<{ session_id: string; ok: true; backgroundTask: Promise<void> }> {
  const sb = supabaseAdmin();

  const qualityModel = modelId || (briefing?.quality_model as string) || "";
  if (!qualityModel) {
    throw new Error("[cortex] quality_model is required — the user must select a model in the power selector");
  }

  console.log(`[cortex] Starting session with quality_model: ${qualityModel}`);

  const fallbackModelId = (briefing?.fallback_model_id as string) || null;

  const { data, error } = await sb
    .from("prometheus_build_sessions")
    .insert({
      user_id: userId,
      intent: "create",
      phase: "discovery",
      messages: [],
      requirements: briefing || null,
      target_flow_id: flowId || null,
      quality_model: qualityModel,
      fallback_model_id: fallbackModelId,
    } as any)
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to create session: ${error?.message}`);

  const sessionId = data.id;

  // Return background task for waitUntil
  const backgroundTask = processInitialBriefing(sb, sessionId, briefing, qualityModel, userId).catch(err =>
    console.error("[cortex] Background briefing error:", err)
  );

  return { session_id: sessionId, ok: true, backgroundTask };
}

// ═══ INITIAL BRIEFING (background) ═══

async function processInitialBriefing(
  sb: ReturnType<typeof supabaseAdmin>,
  sessionId: string,
  briefing: Record<string, unknown>,
  modelId: string,
  userId: string,
) {
  try {
    await insertTurn(sb, sessionId, "cortex",
      "Iniciando sessão de planejamento. Vou reunir a equipe para analisar seu projeto.",
      "decision", "discovery", 1);

    // Enrichment v2: Research domain and infer config BEFORE analysis
    const rawPrompt = (briefing?.prompt as string) || (briefing?.objective as string) || JSON.stringify(briefing);
    if (rawPrompt && rawPrompt.length >= 10) {
      const enrichResult = await runEnrichment({
        prompt: rawPrompt,
        modelId,
        sessionId,
        sb,
        tenantId: userId,
      });

      // Always merge enrichment output into the briefing. The enrichment step
      // (deterministic or LLM-assisted) always infers domain/complexity/channels/
      // personality even when it leaves the prompt text unchanged — so merging must
      // NOT be gated on the prompt being rewritten (that left simple {prompt}
      // briefings stuck in "discovery"). The enrichment turn is emitted inside
      // runEnrichment, so we don't duplicate it here.
      briefing = {
        ...briefing,
        personality: enrichResult.personality,
        architecture_type: enrichResult.architecture_type,
        channels: enrichResult.channels,
        domain: enrichResult.domain,
        complexity: enrichResult.complexity,
        integrations: enrichResult.integrations,
        enriched_prompt: enrichResult.enriched_prompt,
      };

      // Persist enriched research cache
      if (enrichResult.researchCache && Object.keys(enrichResult.researchCache).length > 0) {
        await sb.from("prometheus_build_sessions")
          .update({ research_cache: enrichResult.researchCache } as any)
          .eq("id", sessionId);
      }
    }

    // Run the analyst whenever we have a usable briefing. After enrichment the
    // briefing always carries domain/channels/etc., so a simple {prompt} request
    // now advances instead of stalling silently in "discovery".
    if (briefing && Object.keys(briefing).length > 0) {
      const { data: sessionRow } = await sb
        .from("prometheus_build_sessions")
        .select("research_cache")
        .eq("id", sessionId)
        .single();

      const researchCache = (sessionRow?.research_cache || {}) as Record<string, unknown>;
      const hasResearch = Object.keys(researchCache).length > 0;

      const rawAnalyst = await analyzeRequirements(
        JSON.stringify(briefing),
        JSON.stringify(briefing),
        modelId,
        { sessionId, sb, round: 1, researchCache, tenantId: userId },
      );
      const analystResult = sanitizeAnalystResult(rawAnalyst, hasResearch);

      await insertTurn(sb, sessionId, "analyst",
        formatAnalystOutput(analystResult),
        "analysis", "discovery", 1,
        { requirements: analystResult.requirements });

      const mergedReqs = {
        ...(typeof briefing === "object" ? briefing : {}),
        ...analystResult.requirements,
      };

      await sb.from("prometheus_build_sessions").update({
        requirements: mergedReqs,
        specialist_calls: [{ agent: "analyst", action: "analyze", timestamp: Date.now() }],
      } as any).eq("id", sessionId);

      if (analystResult.clarification_questions?.length > 0) {
        const forkQ = analystResult.clarification_questions[0];
        await insertTurn(sb, sessionId, "cortex",
          forkQ.question,
          "decision", "planning", 1,
          {
            decision_fork: {
              question: forkQ.question,
              options: forkQ.options || [],
              evidence: (forkQ as { evidence_from_research?: string }).evidence_from_research,
            },
          });
      }

      await runBoardroomRoundtable(
        sb, sessionId, rawPrompt, mergedReqs, 1, modelId,
        true, undefined, undefined, true,
      );
    }
  } catch (err) {
    // Mantém uma fase válida para evitar falha silenciosa ao persistir o erro
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[cortex] processInitialBriefing failed:", msg);
    await insertTurn(sb, sessionId, "cortex",
      `❌ Erro ao iniciar análise: ${msg}. Tente novamente.`,
      "decision", "discovery", 1).catch((insertErr) => {
        console.error("[cortex] Failed to persist initial briefing error turn:", insertErr);
      });
    await updateSessionPhase(sb, sessionId, "discovery").catch((phaseErr) => {
      console.error("[cortex] Failed to persist initial briefing error phase:", phaseErr);
    });
  }
}

// ═══ MESSAGE PROCESSING ═══

export async function processMessage(
  sessionId: string,
  userId: string,
  message: string,
): Promise<{ ok: true; backgroundTask: Promise<void> }> {
  const sb = supabaseAdmin();

  const { data: session, error } = await sb
    .from("prometheus_build_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (error || !session) throw new Error("Session not found");

  const { data: newRound, error: incrErr } = await sb
    .rpc("prometheus_increment_iteration", { p_session_id: sessionId } as any);

  if (incrErr || !newRound) {
    console.error("[cortex] Atomic iteration increment failed:", incrErr?.message);
    throw new Error("Failed to increment iteration — possible concurrent access");
  }
  const round = newRound as number;

  await insertTurn(sb, sessionId, "user", message, "user_input", session.phase, round);

  // Return background task for waitUntil
  const backgroundTask = processMessageAsync(sb, sessionId, session, message, round).catch(err =>
    console.error("[cortex] Background message error:", err)
  );

  return { ok: true, backgroundTask };
}

export type SessionIntent = "approve" | "request_changes" | "reject_plan" | "halt";

export async function processIntent(
  sessionId: string,
  userId: string,
  intent: SessionIntent,
  feedback?: string,
): Promise<{ ok: true; backgroundTask: Promise<void> }> {
  const sb = supabaseAdmin();

  const { data: session, error } = await sb
    .from("prometheus_build_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (error || !session) throw new Error("Session not found");

  const { data: newRound, error: incrErr } = await sb
    .rpc("prometheus_increment_iteration", { p_session_id: sessionId } as any);

  if (incrErr || !newRound) throw new Error("Failed to increment iteration");
  const round = newRound as number;

  if (feedback?.trim()) {
    await insertTurn(sb, sessionId, "user", feedback.trim(), "user_input", session.phase, round);
  }

  const backgroundTask = processIntentAsync(sb, sessionId, session, intent, feedback?.trim() || "", round).catch(err =>
    console.error("[cortex] Background intent error:", err)
  );

  return { ok: true, backgroundTask };
}

async function processIntentAsync(
  sb: ReturnType<typeof supabaseAdmin>,
  sessionId: string,
  session: any,
  intent: SessionIntent,
  feedback: string,
  round: number,
) {
  const modelId = getModelId(session);
  const motorTenantId = session.user_id as string;
  const rawPrompt = (session.requirements as Record<string, unknown>)?.objective as string
    || feedback
    || "Revisar plano do agente";

  switch (intent) {
    case "approve": {
      if (session.phase !== "approval") {
        await insertTurn(sb, sessionId, "cortex",
          "Aprovação só está disponível quando o plano estiver pronto.",
          "decision", session.phase, round);
        return;
      }
      await insertTurn(sb, sessionId, "cortex",
        "Aprovado! Scribe, inicie a construção dos prompts.",
        "decision", "building", round);
      await updateSessionPhase(sb, sessionId, "building");
      const { data: freshSession } = await sb
        .from("prometheus_build_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      if (freshSession) {
        await runScribePhase(sb, sessionId, freshSession, round, modelId);
      }
      break;
    }
    case "request_changes": {
      await insertTurn(sb, sessionId, "cortex",
        feedback
          ? "Entendido. A equipe vai re-deliberar incorporando seu feedback."
          : "Voltando à deliberação para ajustes.",
        "decision", "planning", round);
      await updateSessionPhase(sb, sessionId, "planning");
      await runBoardroomRoundtable(
        sb, sessionId,
        feedback || "Ajustar o plano conforme feedback do usuário",
        session.requirements || {},
        round, modelId,
        false,
      );
      break;
    }
    case "reject_plan": {
      await insertTurn(sb, sessionId, "cortex",
        "Plano rejeitado. Reiniciando deliberação do zero.",
        "decision", "planning", round);
      await updateSessionPhase(sb, sessionId, "planning");
      await sb.from("prometheus_build_sessions").update({ architecture: null }).eq("id", sessionId);
      await runBoardroomRoundtable(
        sb, sessionId,
        feedback || rawPrompt,
        session.requirements || {},
        round, modelId,
        true,
      );
      break;
    }
    case "halt": {
      await insertTurn(sb, sessionId, "cortex",
        "Deliberação interrompida. Você pode retomar enviando feedback ou pedindo mudanças.",
        "decision", session.phase, round,
        { halted: true });
      await sb.from("prometheus_build_sessions").update({
        deliberation_state: { halted: true },
      }).eq("id", sessionId);
      break;
    }
  }
}

// ═══ FSM ROUTER ═══

async function processMessageAsync(
  sb: ReturnType<typeof supabaseAdmin>,
  sessionId: string,
  session: any,
  message: string,
  round: number,
) {
  try {
  const phase = session.phase as PrometheusPhase;
  const modelId = getModelId(session);
  const motorTenantId = session.user_id as string;

  switch (phase) {
    case "discovery":
    case "clarification": {
      const pendingQuestions = phase === "clarification"
        ? await getLatestPendingClarifications(sb, sessionId)
        : [];

      const analystInput = phase === "clarification" && pendingQuestions.length > 0
        ? [
            "CONTEXTO DE CLARIFICAÇÃO",
            `Requisitos atuais: ${JSON.stringify(session.requirements || {})}`,
            "Perguntas pendentes feitas ao usuário:",
            ...pendingQuestions.map((q, i) => {
              const options = q.options?.length ? ` (Opções: ${q.options.join(" | ")})` : "";
              return `${i + 1}. [${q.id || `q${i + 1}`}] ${q.question}${options}`;
            }),
            `Resposta soberana do usuário: ${message}`,
            "Tarefa: trate a resposta do usuário como resposta direta às perguntas pendentes, consolide os requisitos e só gere novas perguntas se faltar algo indispensável para montar a arquitetura. Nunca repita perguntas já respondidas ou semanticamente equivalentes.",
          ].join("\n")
        : message;

      const analystResult = await analyzeRequirements(
        analystInput,
        JSON.stringify({
          current_requirements: session.requirements || {},
          pending_questions: pendingQuestions,
          phase,
        }),
        modelId,
        { tenantId: motorTenantId },
      );

      const nextQuestions = phase === "clarification"
        ? filterDuplicateClarifications(analystResult.clarification_questions || [], pendingQuestions)
        : (analystResult.clarification_questions || []).slice(0, 3);

      await insertTurn(sb, sessionId, "analyst",
        formatAnalystOutput(analystResult),
        "analysis", phase, round,
        { requirements: analystResult.requirements, questions: nextQuestions });

      const mergedReqs = {
        ...(session.requirements || {}),
        ...analystResult.requirements,
        ...(phase === "clarification" ? { last_user_clarification: message } : {}),
      };
      await sb.from("prometheus_build_sessions")
        .update({ requirements: mergedReqs } as any)
        .eq("id", sessionId);

      const clarificationResolved = phase === "clarification" && pendingQuestions.length > 0 && nextQuestions.length === 0;

      if (analystResult.is_complete || clarificationResolved) {
        await insertTurn(sb, sessionId, "cortex",
          "Resposta incorporada aos requisitos. Architect, elabore o plano arquitetural.",
          "decision", "planning", round);
        await updateSessionPhase(sb, sessionId, "planning");
        // AUTO-TRIGGER ARCHITECT
        await runPlanningPhase(sb, sessionId, mergedReqs, modelId, round, motorTenantId);
      } else if (nextQuestions.length > 0) {
        if (phase !== "clarification") {
          await insertTurn(sb, sessionId, "cortex",
            "Recebi sua mensagem. Vou incorporar na discussão que está em andamento.",
            "decision", "planning", round);
        } else {
          await runBoardroomRoundtable(sb, sessionId, message, session.requirements || {}, round, modelId);
        }
        await insertTurn(sb, sessionId, "analyst",
          formatClarifications(nextQuestions),
          "analysis", "clarification", round,
          { questions: nextQuestions });
      } else {
        await insertTurn(sb, sessionId, "cortex",
          "Informações suficientes para seguir. Architect, elabore o plano arquitetural.",
          "decision", "planning", round);
        await updateSessionPhase(sb, sessionId, "planning");
        // AUTO-TRIGGER ARCHITECT
        await runPlanningPhase(sb, sessionId, mergedReqs, modelId, round, motorTenantId);
      }
      break;
    }

    case "planning": {
      const haltRx = /\b(parar|pare|stop|cancelar|halt|abortar)\b/i;
      if (haltRx.test(message)) {
        await insertTurn(sb, sessionId, "cortex",
          "Deliberação interrompida.",
          "decision", "planning", round,
          { halted: true });
        await sb.from("prometheus_build_sessions").update({
          deliberation_state: { halted: true },
        }).eq("id", sessionId);
        break;
      }
      await insertTurn(sb, sessionId, "cortex",
        "Recebido. Incorporando seu feedback na deliberação.",
        "decision", "planning", round);
      await runBoardroomRoundtable(
        sb, sessionId, message,
        session.requirements || {},
        round, modelId,
        false,
      );
      break;
    }

    // ── Approval: free text does not auto-approve (use explicit intent actions) ──
    case "approval": {
      await insertTurn(sb, sessionId, "cortex",
        "O plano está pronto para revisão.\n\n" +
        "• Use **Aprovar** para iniciar a construção\n" +
        "• Use **Pedir mudanças** ou **Rejeitar** no painel do plano\n" +
        "• Ou interaja no chat durante a deliberação",
        "decision", "approval", round);
      break;
    }

      // ── Building: user messages acknowledged ──
      case "building": {
        await insertTurn(sb, sessionId, "cortex",
          "Construção em andamento. Aguarde a finalização dos prompts e configurações.",
          "decision", "building", round);
        break;
      }

      // ── Testing: Sentinel execution (delegates to pipeline) ──
      case "testing": {
        await insertTurn(sb, sessionId, "cortex",
          "Sentinel, execute os testes de qualidade no agente.",
          "decision", "testing", round);
        await runSentinelPhase(sb, sessionId, round, modelId);
        break;
      }

      // ── Review: deploy or redo ──
      case "review": {
        const isDeploy = /deploy|publicar|salvar|finalizar|pronto|sim|go|vamos/i.test(message);
        const isRedo = /refazer|voltar|ajustar|melhorar|corrigir/i.test(message);

        if (isDeploy) {
          await insertTurn(sb, sessionId, "cortex",
            "Salvando o agente e preparando deploy...",
            "decision", "deploying", round);
          await updateSessionPhase(sb, sessionId, "deploying");
          await deployFlow(sb, sessionId, session, round);
        } else if (isRedo) {
          await insertTurn(sb, sessionId, "cortex",
            "Voltando para construção. Scribe, revise os prompts.",
            "decision", "building", round);
          await updateSessionPhase(sb, sessionId, "building");
          await runScribePhase(sb, sessionId, session, round, modelId);
        } else {
          const llmResponse = await routeLLM({
            model_id: modelId,
            messages: [
              { role: "system", content: CORTEX_SYSTEM_PROMPT },
              { role: "user", content: `O agente está na fase de revisão. O usuário diz: "${sanitizeForPrompt(message)}". Responda como Cortex, explicando que ele pode "deploy/salvar" ou "ajustar/voltar".` },
            ],
            temperature: 0.7,
            max_tokens: 4096,
            tenant_id: motorTenantId,
          });
          await persistTokensUsed(sb, sessionId, (session.tokens_used || 0) + (llmResponse.tokens_in + llmResponse.tokens_out));
          const responseContent = llmResponse?.content || "Desculpe, não consegui processar sua mensagem. Você pode \"deploy/salvar\" ou \"ajustar/voltar\".";
          await insertTurn(sb, sessionId, "cortex",
            responseContent,
            "decision", "review", round,
            { awaiting_input: true });
        }
        break;
      }

      // ── Terminal states ──
      case "deploying":
      case "complete": {
        await insertTurn(sb, sessionId, "cortex",
          session.phase === "complete"
            ? "O agente já foi criado e salvo! Abra-o no Builder para ajustes manuais."
            : "Deploy em andamento, aguarde...",
          "decision", session.phase, round);
        break;
      }

      // ── Fallback ──
      default: {
        const history = (session.messages || []).slice(-6);
        const llmResponse = await routeLLM({
          model_id: modelId,
          messages: [
            { role: "system", content: CORTEX_SYSTEM_PROMPT },
            ...history.map((m: any) => ({
              role: m.role === "user" ? "user" as const : "assistant" as const,
              content: m.content,
            })),
            { role: "user" as const, content: message },
          ],
          temperature: 0.7,
          max_tokens: 4096,
          tenant_id: motorTenantId,
        });
        await persistTokensUsed(sb, sessionId, (session.tokens_used || 0) + (llmResponse.tokens_in + llmResponse.tokens_out));
        await insertTurn(sb, sessionId, "cortex",
          llmResponse.content,
          "decision", phase, round);
        break;
      }
    }
  } catch (err) {
    // Mantém uma fase válida para evitar quebra de leitura no frontend
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[cortex] processMessageAsync failed:", msg);
    await insertTurn(sb, sessionId, "cortex",
      `❌ Erro ao processar mensagem: ${msg}. Tente novamente.`,
      "decision", phase === "approval" || phase === "planning" ? phase : "clarification", round).catch((insertErr) => {
        console.error("[cortex] Failed to persist message error turn:", insertErr);
      });
    await updateSessionPhase(sb, sessionId, phase === "approval" || phase === "planning" ? phase : "clarification").catch((phaseErr) => {
      console.error("[cortex] Failed to persist message error phase:", phaseErr);
    });
  }
}

// ═══ SESSION STATUS ═══

export async function getSessionStatus(
  sessionId: string,
  userId: string,
): Promise<{ session_id: string; phase: string; done: boolean }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("prometheus_build_sessions")
    .select("id, phase, success")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new Error("Session not found");

  return {
    session_id: data.id,
    phase: data.phase,
    done: data.phase === "complete",
  };
}

// ═══ SESSION SUMMARIZE ═══

export async function summarizeSession(
  sessionId: string,
  userId: string,
): Promise<{ ok: true; summary_saved: boolean }> {
  const sb = supabaseAdmin();

  const { data: session, error } = await sb
    .from("prometheus_build_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (error || !session) throw new Error("Session not found");

  if (session.phase === "complete") {
    return { ok: true, summary_saved: false };
  }

  const { data: turns } = await sb
    .from("prometheus_build_turns")
    .select("agent_key, content, phase, message_type, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (!turns?.length) {
    return { ok: true, summary_saved: false };
  }

  const modelId = session.quality_model;
  let summaryMd: string;

  try {
    const turnsText = turns.map((t: any) =>
      `[${t.phase}] ${t.agent_key}: ${t.content.substring(0, 200)}`
    ).join("\n");

    const llmResponse = await routeLLM({
      model_id: modelId,
      tenant_id: userId,
      messages: [
        {
          role: "system",
          content: `Você é o Cortex, orquestrador do Prometheus. Gere um resumo em Markdown da sessão de construção do agente.
O resumo deve conter:
# Resumo da Sessão
## Fase Atual: [fase]
## Decisões Tomadas
- lista de decisões
## Requisitos Identificados
- lista de requisitos
## Próximos Passos
- o que falta fazer
## Contexto para Retomada
- informações essenciais para continuar de onde parou`,
        },
        {
          role: "user",
          content: `Sessão interrompida na fase "${session.phase}". Turns:\n${turnsText}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });

    summaryMd = llmResponse?.content || `# Sessão interrompida\n\nFase: ${session.phase}\nTurns: ${turns.length}`;
  } catch (err) {
    console.error("[cortex] Summary LLM error:", err);
    summaryMd = `# Resumo da Sessão (auto-gerado)\n\n## Fase: ${session.phase}\n## Mensagens: ${turns.length}\n\n### Timeline\n${
      turns.map((t: any) => `- **${t.agent_key}** (${t.phase}): ${t.content.substring(0, 100)}...`).join("\n")
    }`;
  }

  await insertTurn(sb, sessionId, "cortex",
    summaryMd,
    "decision", session.phase,
    (session.iterations || 0) + 1,
    { type: "session_summary", interrupted: true, phase_at_interrupt: session.phase });

  await sb.from("prometheus_build_sessions").update({
    session_summary: summaryMd,
  }).eq("id", sessionId);

  return { ok: true, summary_saved: true };
}

// ═══ HELPERS ═══

function formatAnalystOutput(result: any): string {
  const r = result.requirements;
  if (!r) return "Analisando requisitos...";

  const lines = [
    `Analisando requisitos:`,
    `• Objetivo: ${r.objective || "identificado"}`,
    `• Público-alvo: ${r.target_audience || "mapeado"}`,
    `• Complexidade: ${r.complexity || "média"}`,
    r.channels?.length ? `• Canais: ${r.channels.join(", ")}` : null,
    r.tools_needed?.length ? `• Ferramentas: ${r.tools_needed.join(", ")}` : null,
    r.has_rag ? `• Base de conhecimento: necessária` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

function formatClarifications(questions: any[]): string {
  if (!questions?.length) return "";
  return questions.map((q, i) => {
    let line = `${i + 1}. ${q.question}`;
    if (q.options?.length) line += `\n   Opções: ${q.options.join(" | ")}`;
    return line;
  }).join("\n\n");
}

function normalizeClarificationKey(question: Partial<ClarificationQuestion>): string {
  return `${question.id || ""} ${question.question || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function filterDuplicateClarifications(
  questions: ClarificationQuestion[],
  previousQuestions: ClarificationQuestion[],
): ClarificationQuestion[] {
  const previousKeys = new Set(previousQuestions.map(normalizeClarificationKey));
  const emittedKeys = new Set<string>();

  return questions.filter((question) => {
    const key = normalizeClarificationKey(question);
    if (!key || previousKeys.has(key) || emittedKeys.has(key)) return false;
    emittedKeys.add(key);
    return true;
  }).slice(0, 3);
}

async function getLatestPendingClarifications(
  sb: ReturnType<typeof createClient>,
  sessionId: string,
): Promise<ClarificationQuestion[]> {
  const { data, error } = await sb
    .from("prometheus_build_turns")
    .select("output_data, created_at")
    .eq("session_id", sessionId)
    .eq("agent_key", "analyst")
    .eq("phase", "clarification")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error || !data?.length) return [];

  for (const row of data as Array<{ output_data?: Record<string, unknown> | null }>) {
    const questions = row.output_data?.questions;
    if (Array.isArray(questions) && questions.length > 0) {
      return questions.slice(0, 3) as ClarificationQuestion[];
    }
  }

  return [];
}

// ═══ PLANNING PHASE (auto-triggered after discovery/clarification) ═══

async function runPlanningPhase(
  sb: ReturnType<typeof createClient>,
  sessionId: string,
  requirements: Record<string, unknown>,
  modelId: string,
  round: number,
  tenantId: string,
) {
  try {
    await insertTurn(sb, sessionId, "architect",
      "Analisando requisitos e selecionando genome ideal...",
      "architecture", "planning", round);

    const architecture = await generateArchitecture(requirements as any, modelId, { tenantId });

    // Format architecture for display
    const nodesList = architecture.nodes.map(n => `• ${n.label} (${n.type})`).join("\n");
    const archContent = `Plano arquitetural gerado:\n\nGenome: ${architecture.genome_name}\n\nNós:\n${nodesList}\n\nModelos: ${architecture.models_used.join(", ")}\nCusto estimado: $${architecture.estimated_cost_per_interaction.toFixed(4)}/interação\nLatência estimada: ${architecture.estimated_latency_ms}ms`;

    await insertTurn(sb, sessionId, "architect",
      archContent,
      "architecture", "planning", round,
      { architecture });

    // Save architecture to session
    await sb.from("prometheus_build_sessions").update({
      architecture,
    }).eq("id", sessionId);

    await writeArchitectureToFlow(sb, sessionId, architecture, requirements);

    await insertTurn(sb, sessionId, "cortex",
      "Plano pronto. Aprove para iniciar a construção ou peça ajustes.",
      "decision", "approval", round);
    await updateSessionPhase(sb, sessionId, "approval");
  } catch (err) {
    console.error("[cortex] runPlanningPhase error:", err);
    const errMsg = err instanceof Error ? err.message : "Erro desconhecido";

    // FALLBACK DETERMINÍSTICO: gerar plano mínimo em vez de travar
    try {
      const { fallbackPlan } = await import("./prometheus-architect.ts");
      const fallback = fallbackPlan(requirements as any, modelId);

      const nodesList = fallback.nodes.map(n => `• ${n.label} (${n.type})`).join("\n");
      const archContent = `⚠️ Plano gerado com template padrão (o genome ideal não pôde ser consultado):\n\nGenome: ${fallback.genome_name}\n\nNós:\n${nodesList}\n\nModelos: ${fallback.models_used.join(", ")}\nCusto estimado: $${fallback.estimated_cost_per_interaction.toFixed(4)}/interação\nLatência estimada: ${fallback.estimated_latency_ms}ms`;

      await insertTurn(sb, sessionId, "architect",
        archContent,
        "architecture", "planning", round,
        { architecture: fallback });

      await sb.from("prometheus_build_sessions").update({
        architecture: fallback,
      }).eq("id", sessionId);

      await writeArchitectureToFlow(sb, sessionId, fallback, requirements);

      await insertTurn(sb, sessionId, "cortex",
        "Plano gerado com template padrão. Aprove para iniciar a construção ou peça ajustes.",
        "decision", "approval", round);
      await updateSessionPhase(sb, sessionId, "approval");
    } catch (fallbackErr) {
      // Even fallback failed — give user a clear error with recovery path
      console.error("[cortex] Fallback plan also failed:", fallbackErr);
      await insertTurn(sb, sessionId, "cortex",
        `❌ Não foi possível gerar o plano arquitetural: ${errMsg}. Envie uma mensagem para tentar novamente ou volte ao briefing.`,
        "decision", "planning", round,
        { error: errMsg, recoverable: true });
    }
  }
}
