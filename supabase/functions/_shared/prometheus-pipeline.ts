/**
 * prometheus-pipeline.ts — Post-approval execution phases
 * Scribe (building), Sentinel (testing), Deploy, Codex P11 performance tracking.
 * Step 12 (ReAct v2): Smart loop — test → diagnose → repair → retest (max 3x).
 */

import { generatePrompts, repairNode, configureToolNodes, type RepairConfig } from "./prometheus-scribe.ts";
import { runSentinel, saveFlowToAgentFlows, type SentinelConfig } from "./prometheus-sentinel.ts";
import { generateReport, type ReportInput } from "./prometheus-report.ts";
import {
  type SupabaseAdmin,
  insertTurn,
  updateSessionPhase,
} from "./prometheus-db.ts";

// ═══ SCRIBE PHASE (building) ═══

export async function runScribePhase(
  sb: SupabaseAdmin,
  sessionId: string,
  session: any,
  round: number,
  modelId: string,
) {
  const architecture = session.architecture;
  const requirements = session.requirements || {};
  const motorTenantId = session.user_id as string;

  if (!architecture) {
    await insertTurn(sb, sessionId, "cortex",
      "Erro: arquitetura não encontrada. Voltando ao planejamento.",
      "decision", "planning", round);
    await updateSessionPhase(sb, sessionId, "planning");
    return;
  }

  try {
    // Load research cache and token budget for ReAct
    const { data: sessionData } = await sb
      .from("prometheus_build_sessions")
      .select("research_cache, tokens_used, token_budget")
      .eq("id", sessionId)
      .single();

    const repairConfig: RepairConfig = {
      sessionId,
      sb,
      round,
      researchCache: (sessionData?.research_cache || {}) as Record<string, unknown>,
      tokenBudget: sessionData?.token_budget
        ? { used: sessionData.tokens_used || 0, limit: sessionData.token_budget }
        : undefined,
      tenantId: motorTenantId,
    };

    await insertTurn(sb, sessionId, "scribe",
      "Analisando a arquitetura para gerar prompts otimizados...",
      "generation", "building", round);

    const scribeResult = await generatePrompts(architecture, requirements, modelId, motorTenantId);

    if (!scribeResult?.prompts || Object.keys(scribeResult.prompts).length === 0) {
      throw new Error("Scribe não gerou nenhum prompt válido para a arquitetura.");
    }

    // Step 13: Configure tool nodes via registry
    const enrichedToolConfigs = await configureToolNodes(architecture, requirements, modelId, repairConfig);
    const finalToolConfigs = { ...scribeResult.tool_configs, ...enrichedToolConfigs };

    const promptEntries = Object.entries(scribeResult.prompts);
    const promptSummary = promptEntries.map(([nodeId, p]) =>
      `• **${p.description}** (${nodeId}): ${p.system_prompt.substring(0, 80)}...`
    ).join("\n");

    const toolSummary = Object.entries(finalToolConfigs)
      .map(([nodeId, t]) => `• ${nodeId}: ${t.tools.join(", ") || "nenhuma"}`)
      .join("\n");

    const scribeContent = `Prompts gerados para ${promptEntries.length} nó(s) LLM:\n\n${promptSummary}` +
      (toolSummary ? `\n\nFerramentas configuradas:\n${toolSummary}` : "") +
      (scribeResult.rag_config ? `\n\nRAG: habilitado (chunk_size: ${scribeResult.rag_config.chunk_size}, top_k: ${scribeResult.rag_config.top_k})` : "") +
      (scribeResult.fallback_nodes && scribeResult.fallback_nodes.length > 0
        ? `\n\n⚠️ ${scribeResult.fallback_nodes.length} nó(s) usaram prompt determinístico (geração via modelo falhou): ${scribeResult.fallback_nodes.join(", ")}`
        : "") +
      `\n\n✅ Safety layer injetada em todos os prompts.`;

    await insertTurn(sb, sessionId, "scribe",
      scribeContent,
      "generation", "building", round,
      { prompts: scribeResult.prompts, tool_configs: finalToolConfigs, rag_config: scribeResult.rag_config });

    await sb.from("prometheus_build_sessions").update({
      prompts: scribeResult.prompts,
      flow_definition: {
        nodes: architecture.nodes,
        edges: architecture.edges,
        tool_configs: finalToolConfigs,
        rag_config: scribeResult.rag_config,
      },
    }).eq("id", sessionId);

    // Advance to testing
    await insertTurn(sb, sessionId, "cortex",
      "Prompts e configurações prontos. Avançando para fase de testes. Sentinel, avalie o agente.",
      "decision", "testing", round);
    await updateSessionPhase(sb, sessionId, "testing");

    await runSentinelPhase(sb, sessionId, round, modelId);
  } catch (err) {
    // NUNCA travar em "building" em silêncio — surface o erro e volte para um estado recuperável
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[pipeline] runScribePhase failed:", msg);
    await insertTurn(sb, sessionId, "cortex",
      `❌ Falha na construção dos prompts: ${msg}\n\nO plano arquitetural está intacto. Diga **"construir"** para tentar novamente ou **"ajustar"** para revisar o plano.`,
      "decision", "approval", round,
      { error: msg, recoverable: true, failed_phase: "building" }).catch((e) =>
        console.error("[pipeline] Failed to persist Scribe error turn:", e));
    await updateSessionPhase(sb, sessionId, "approval").catch((e) =>
      console.error("[pipeline] Failed to reset phase after Scribe error:", e));
  }
}

// ═══ SENTINEL PHASE (testing) — Step 12: Smart loop ═══

const MAX_REPAIR_ITERATIONS = 3;
const MIN_TOKENS_FOR_REPAIR = 5000;

export async function runSentinelPhase(
  sb: SupabaseAdmin,
  sessionId: string,
  round: number,
  modelId: string,
) {
  try {
  const { data: session } = await sb
    .from("prometheus_build_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session?.architecture || !session?.prompts) {
    await insertTurn(sb, sessionId, "cortex",
      "Erro: dados insuficientes para testes. Voltando ao planejamento.",
      "decision", "planning", round);
    await updateSessionPhase(sb, sessionId, "planning");
    return;
  }

  const iteration = session.iterations || 1;
  const flowId = session.output_flow_id || undefined;
  const motorTenantId = session.user_id as string;
  const sentinelConfig: SentinelConfig = { sessionId, sb, flowId, tenantId: motorTenantId };

  await insertTurn(sb, sessionId, "sentinel",
    `Gerando casos de teste e executando ${flowId ? "testes reais" : "dry-runs"} (iteração ${iteration}/${MAX_REPAIR_ITERATIONS})...`,
    "test_result", "testing", round);

  let report = await runSentinel(
    session.architecture,
    session.requirements || {},
    session.prompts,
    modelId,
    iteration,
    sentinelConfig,
  );

  // ─── Smart repair loop ───
  let currentPrompts = { ...session.prompts };
  let currentIteration = iteration;

  while (report.pass_rate < 0.7 && currentIteration < MAX_REPAIR_ITERATIONS) {
    // Check token budget
    const tokensUsed = session.tokens_used || 0;
    const tokenLimit = session.token_budget || 50000;
    if (tokenLimit - tokensUsed < MIN_TOKENS_FOR_REPAIR) {
      await insertTurn(sb, sessionId, "sentinel",
        `⚠️ Orçamento de tokens insuficiente para mais reparos (${tokenLimit - tokensUsed} restantes). Encerrando iterações.`,
        "test_result", "testing", round);
      break;
    }

    // Identify failed tests with diagnostics
    const failedResults = report.test_results.filter(r => !r.passed && r.node_diagnostics?.length);
    if (failedResults.length === 0) break; // No actionable diagnostics

    // Collect unique failing nodes
    const failingNodes = new Map<string, { error: string; suggestion: string }>();
    for (const result of failedResults) {
      for (const diag of result.node_diagnostics || []) {
        if (!failingNodes.has(diag.node_id)) {
          failingNodes.set(diag.node_id, { error: diag.error, suggestion: diag.suggestion });
        }
      }
    }

    if (failingNodes.size === 0) break;

    currentIteration++;
    const repairConfig: RepairConfig = {
      sessionId,
      sb,
      round,
      researchCache: (session.research_cache || {}) as Record<string, unknown>,
      tokenBudget: { used: tokensUsed, limit: tokenLimit },
      tenantId: motorTenantId,
    };

    await insertTurn(sb, sessionId, "scribe",
      `Reparando ${failingNodes.size} nó(s) com falha (iteração ${currentIteration}/${MAX_REPAIR_ITERATIONS}):\n` +
      [...failingNodes.entries()].map(([nId, d]) => `• ${nId}: ${d.error}`).join("\n"),
      "generation", "testing", round);

    // Repair each failing node
    let repaired = 0;
    for (const [nodeId, diag] of failingNodes) {
      if (!currentPrompts[nodeId]) continue;
      const result = await repairNode(
        nodeId,
        currentPrompts[nodeId].system_prompt,
        { node_id: nodeId, node_type: "llm", ...diag },
        session.requirements || {},
        modelId,
        repairConfig,
      );
      if (result.repaired) {
        currentPrompts[nodeId] = {
          ...currentPrompts[nodeId],
          system_prompt: result.system_prompt,
          description: result.description,
        };
        repaired++;
      }
    }

    if (repaired === 0) break; // Nothing was fixed

    // Persist repaired prompts
    await sb.from("prometheus_build_sessions").update({
      prompts: currentPrompts,
      iterations: currentIteration,
    }).eq("id", sessionId);

    // Re-test with updated prompts
    await insertTurn(sb, sessionId, "sentinel",
      `Retestando após ${repaired} correção(ões)...`,
      "test_result", "testing", round);

    report = await runSentinel(
      session.architecture,
      session.requirements || {},
      currentPrompts,
      modelId,
      currentIteration,
      sentinelConfig,
    );
  }

  // ─── Report results ───
  const resultLines = report.test_results.map(r => {
    const icon = r.passed ? "✅" : "❌";
    const diagNote = r.node_diagnostics?.length
      ? ` (${r.node_diagnostics.map(d => d.node_id).join(", ")})`
      : "";
    return `${icon} **${r.test_case.name}** (${r.test_case.category}): ${r.eval_scores.aggregate.toFixed(2)}${diagNote}`;
  }).join("\n");

  const summaryContent = `Resultados dos testes (iteração ${currentIteration}/${MAX_REPAIR_ITERATIONS}):\n\n${resultLines}\n\n` +
    `📊 **Pass rate**: ${(report.pass_rate * 100).toFixed(0)}%\n` +
    `📊 **Qualidade média**: ${(report.avg_quality * 100).toFixed(0)}%\n` +
    `⏱️ **Latência total**: ${report.total_latency_ms}ms` +
    (currentIteration > 1 ? `\n🔧 **Iterações de reparo**: ${currentIteration - 1}` : "") +
    (report.recommendations.length > 0 ? `\n\n⚠️ ${report.recommendations.join("\n• ")}` : "");

  await insertTurn(sb, sessionId, "sentinel",
    summaryContent,
    "test_result", "testing", round,
    { test_results: report });

  await sb.from("prometheus_build_sessions").update({
    test_results: report,
    iterations: currentIteration,
  }).eq("id", sessionId);

  // Advance to review (no more blind retry — smart loop already handled it)
  await insertTurn(sb, sessionId, "cortex",
    report.pass_rate >= 0.7
      ? "🎉 Testes aprovados! Revise os resultados e diga \"deploy\" para salvar o agente."
      : report.pass_rate >= 0.5
        ? "Testes concluídos com resultado parcial. Revise e decida se deseja salvar o agente."
        : "⚠️ Testes abaixo do limiar mesmo após reparos. Revise os resultados.",
    "decision", "review", round,
    { awaiting_input: true });
  await updateSessionPhase(sb, sessionId, "review");
  } catch (err) {
    // NUNCA travar em "testing" em silêncio — os prompts já estão salvos, então o deploy ainda é possível
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[pipeline] runSentinelPhase failed:", msg);
    await insertTurn(sb, sessionId, "cortex",
      `⚠️ Não foi possível concluir os testes automáticos: ${msg}\n\nOs prompts e a arquitetura já estão prontos. Diga **"deploy"** para salvar o agente mesmo assim ou **"refazer"** para tentar os testes novamente.`,
      "decision", "review", round,
      { error: msg, recoverable: true, failed_phase: "testing", awaiting_input: true }).catch((e) =>
        console.error("[pipeline] Failed to persist Sentinel error turn:", e));
    await updateSessionPhase(sb, sessionId, "review").catch((e) =>
      console.error("[pipeline] Failed to reset phase after Sentinel error:", e));
  }
}

// ═══ DEPLOY ═══

export async function deployFlow(
  sb: SupabaseAdmin,
  sessionId: string,
  session: any,
  round: number,
) {
  try {
    const { data: freshSession } = await sb
      .from("prometheus_build_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (!freshSession?.architecture || !freshSession?.prompts) {
      await insertTurn(sb, sessionId, "cortex",
        "Erro: dados insuficientes para deploy.",
        "decision", "review", round);
      await updateSessionPhase(sb, sessionId, "review");
      return;
    }

    const flowId = await saveFlowToAgentFlows(
      sb,
      freshSession.user_id,
      sessionId,
      freshSession.architecture,
      freshSession.prompts,
      freshSession.requirements || {},
    );

    const createdAt = freshSession.created_at ? new Date(freshSession.created_at).getTime() : Date.now();
    const buildTimeSeconds = Math.round((Date.now() - (isNaN(createdAt) ? Date.now() : createdAt)) / 1000);

    // Step 14: Generate business plan report
    const reportInput: ReportInput = {
      session: freshSession,
      toolCallLogs: [], // TODO: aggregate from turns with tool_calls
    };

    // Collect tool call logs from build turns
    const { data: turns } = await sb
      .from("prometheus_build_turns")
      .select("tool_calls")
      .eq("session_id", sessionId)
      .not("tool_calls", "is", null);

    if (turns) {
      for (const turn of turns) {
        if (Array.isArray(turn.tool_calls)) {
          reportInput.toolCallLogs.push(...turn.tool_calls);
        }
      }
    }

    let report;
    const reportModelId = freshSession.quality_model || freshSession.fallback_model_id || "";
    if (!reportModelId) {
      // Fail-closed: sem modelo válido não inventamos um inexistente (work-or-delete)
      console.warn("[pipeline] Report skipped: session has no quality_model/fallback_model_id");
    } else {
      try {
        report = await generateReport(reportInput, reportModelId, freshSession.user_id);
      } catch (err) {
        console.error("[pipeline] Report generation failed:", err);
      }
    }

    await sb.from("prometheus_build_sessions").update({
      output_flow_id: flowId,
      success: true,
      phase: "complete",
      build_time_seconds: buildTimeSeconds,
      completed_at: new Date().toISOString(),
      ...(report ? { report } : {}),
    }).eq("id", sessionId);

    await recordEmpiricalPerformance(sb, freshSession, buildTimeSeconds);

    await insertTurn(sb, sessionId, "cortex",
      `🎉 **Agente criado com sucesso!**\n\nFlow salvo e pronto para edição no Builder.\nClique em "Abrir no Builder" para ajustes manuais.`,
      "decision", "complete", round,
      { output_flow_id: flowId, final: true });

  } catch (err: any) {
    console.error("[pipeline] Deploy error:", err);
    await insertTurn(sb, sessionId, "cortex",
      `Erro ao salvar o agente: ${err.message}. Tente novamente.`,
      "decision", "review", round);
    await updateSessionPhase(sb, sessionId, "review");
  }
}

// ═══ P11: CODEX EMPIRICAL PERFORMANCE ═══

async function recordEmpiricalPerformance(
  sb: SupabaseAdmin,
  session: any,
  buildTimeSeconds: number,
) {
  try {
    const arch = session.architecture;
    const testResults = session.test_results;
    if (!arch?.genome_id || arch.genome_id === "fallback") return;

    await sb.from("codex_empirical_performance").insert({
      genome_id: arch.genome_id,
      session_id: session.id,
      build_success: true,
      pass_rate: testResults?.pass_rate ?? null,
      avg_quality: testResults?.avg_quality ?? null,
      total_latency_ms: testResults?.total_latency_ms ?? null,
      iterations_needed: session.iterations || 1,
      auto_corrections: Math.max(0, (session.iterations || 1) - 1),
      build_time_seconds: buildTimeSeconds,
      model_used: session.quality_model || null,
      domain: session.requirements?.domain || null,
      complexity: session.requirements?.complexity || null,
      nodes_count: arch.nodes?.length || null,
    });

    console.log(`[pipeline] P11: Recorded empirical performance for genome ${arch.genome_id}`);
  } catch (err) {
    console.error("[pipeline] P11: Failed to record performance:", err);
  }
}
