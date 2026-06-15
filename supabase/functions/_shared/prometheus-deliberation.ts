/**
 * prometheus-deliberation.ts — Multi-turn boardroom deliberation
 * Cortex moderates. All 5 agents discuss, challenge, refine, and converge.
 * User can interject mid-deliberation.
 * 
 * ReAct v2: Passes session config to analyst & architect so they use 
 * tools for real research during deliberation.
 */

import { routeLLM } from "./llm-router.ts";
import { analyzeRequirements, type AnalystConfig } from "./prometheus-analyst.ts";
import { generateArchitecture, type ArchitectConfig } from "./prometheus-architect.ts";
import {
  CORTEX_SYSTEM_PROMPT,
  ANALYST_SYSTEM_PROMPT,
  ANALYST_DIRECTIVE_ADDENDUM,
  CORTEX_MODERATOR_PROMPT,
  AGENT_DELIBERATION_PROMPT,
  CORTEX_ROUNDTABLE_SYNTHESIS_PROMPT,
} from "./prometheus-prompts.ts";
import {
  type SupabaseAdmin,
  AGENT_DISPLAY_NAMES,
  insertTurn,
  updateSessionPhase,
  persistTokensUsed,
  researchCacheHasResults,
  sanitizeForPrompt,
} from "./prometheus-db.ts";

// ═══ AGENT ROLES (deliberation context) ═══

const AGENT_ROLES: Record<string, string> = {
  analyst: "Especialista em requisitos. Extrai, valida e desafia requisitos. Identifica lacunas e domínio.",
  architect: "Projetista de arquitetura. Propõe estrutura de nós, fluxos, genomes. Estima custo e latência.",
  scribe: "Engenheiro de prompts. Antecipa desafios de prompt design, sugere tom/estrutura e avalia se a arquitetura é implementável em termos de prompts.",
  sentinel: "QA e segurança. Antecipa riscos de qualidade, segurança (PII, injection), edge cases e pontos de falha antes da construção.",
  cortex: "Orquestrador e moderador. Sintetiza, desafia, redireciona. Toma decisões de escopo.",
};

const MAX_DELIBERATION_TURNS = 15;

export interface DelibTurn {
  speaker: string;
  content: string;
}

// ═══ INTENT CLASSIFICATION ═══

export function classifyUserIntent(message: string): "directive" | "collaborative" | "question" {
  const lower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (/\?$/.test(message.trim()) ||
      /^(como|o que|qual|quando|por ?que|sera que|posso|da pra|existe)\b/.test(lower)) {
    return "question";
  }

  const directivePatterns = /\b(faz|faca|constroi|construa|cria|crie|monta|monte|gera|gere|build|make|create|go|vai|bora|pode|comeca|inicia|roda|executa|so faz|faz ai|manda|mete|toca|segue|prossiga|avanca)\b/;
  const questionQualifiers = /\b(como|por ?que|o que|qual|quando|sera que|voce acha|opiniao)\b/;

  if (directivePatterns.test(lower) && !questionQualifiers.test(lower)) {
    return "directive";
  }

  if (message.trim().length < 40 && /\b(sim|certo|beleza|blz|top|show|massa|dale|valeu|isso|exato|perfeito)\b/.test(lower)) {
    return "collaborative";
  }

  return "collaborative";
}

// ═══ FORMATTERS ═══

export function formatAnalystOutput(result: any): string {
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

// ═══ BOARDROOM ROUNDTABLE ═══

function isHaltMessage(msg: string): boolean {
  const lower = msg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(parar|pare|stop|cancelar|cancela|halt|abortar|aborta|errado|ta errado|tá errado)\b/.test(lower);
}

function contentFingerprint(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function runBoardroomRoundtable(
  sb: SupabaseAdmin,
  sessionId: string,
  userMessage: string,
  existingRequirements: Record<string, unknown>,
  round: number,
  modelId: string,
  forceDirective = false,
  resumeHistory?: DelibTurn[],
  resumeArchitecture?: any,
  skipAnalystKickoff = false,
) {
  const intent = forceDirective ? "directive" : classifyUserIntent(userMessage);
  const isResume = !!resumeHistory?.length;

  // ReAct v2: Build shared config for analyst/architect
  const { data: sessionRow } = await sb
    .from("prometheus_build_sessions")
    .select("user_id, research_cache, tokens_used, token_budget")
    .eq("id", sessionId)
    .single();

  const motorTenantId = (sessionRow?.user_id as string) || "";

  const researchCache = (sessionRow?.research_cache || {}) as Record<string, unknown>;
  const tokenBudget = sessionRow?.token_budget
    ? { used: sessionRow.tokens_used || 0, limit: sessionRow.token_budget }
    : undefined;

  const analystConfig: AnalystConfig = { sessionId, sb, round, researchCache, tokenBudget, tenantId: motorTenantId };
  const architectConfig: ArchitectConfig = { sessionId, sb, round, researchCache, tokenBudget, tenantId: motorTenantId };

  // Mark deliberation as active to prevent race conditions
  await sb.from("prometheus_build_sessions")
    .update({ deliberation_state: { active: true } })
    .eq("id", sessionId);

  // ─── QUESTION intent: Cortex answers directly ───
  if (intent === "question") {
    const response = await routeLLM({
      model_id: modelId,
      messages: [
        { role: "system", content: CORTEX_SYSTEM_PROMPT },
        { role: "user", content: `O usuário está na fase de planejamento e perguntou: "${sanitizeForPrompt(userMessage)}". Responda de forma útil. Lembre-o que pode descrever o agente que quer construir ou dar uma diretiva.` },
      ],
      temperature: 0.7,
      max_tokens: 1024,
      tenant_id: motorTenantId,
    });
    await persistTokensUsed(sb, sessionId, (sessionRow?.tokens_used || 0) + (response.tokens_in + response.tokens_out));
    await insertTurn(sb, sessionId, "cortex",
      response?.content || "Posso ajudar. Descreva o agente que deseja criar.",
      "decision", "discovery", round,
      { awaiting_input: true });
    await sb.from("prometheus_build_sessions")
      .update({ deliberation_state: null })
      .eq("id", sessionId);
    return;
  }

  // ─── STEP 1: Analyst kicks off (skip on resume) ───
  let deliberation: DelibTurn[];
  let currentReqs = existingRequirements;
  let currentArchitecture: any = resumeArchitecture || null;

  if (isResume) {
    deliberation = resumeHistory!;
    await insertTurn(sb, sessionId, "cortex",
      "Entendido. Retomando a discussão com a equipe.",
      "decision", "planning", round);
  } else if (skipAnalystKickoff && Object.keys(existingRequirements).length > 0) {
    const analystOutput = formatAnalystOutput({ requirements: existingRequirements });
    deliberation = [
      { speaker: "user", content: userMessage },
      { speaker: "analyst", content: analystOutput },
    ];
    currentReqs = { ...existingRequirements };
    await insertTurn(sb, sessionId, "cortex",
      "Requisitos consolidados. A equipe vai deliberar a arquitetura.",
      "decision", "planning", round);
  } else {
    const analystInput = intent === "directive"
      ? userMessage + ANALYST_DIRECTIVE_ADDENDUM
      : userMessage;

    const analystResult = await analyzeRequirements(
      analystInput,
      JSON.stringify(existingRequirements),
      modelId,
      analystConfig,
    );

    currentReqs = { ...existingRequirements, ...analystResult.requirements };
    const analystOutput = formatAnalystOutput(analystResult);

    await insertTurn(sb, sessionId, "analyst",
      analystOutput,
      "analysis", "discovery", round,
      { requirements: analystResult.requirements });

    await sb.from("prometheus_build_sessions")
      .update({ requirements: currentReqs })
      .eq("id", sessionId);

    deliberation = [
      { speaker: "user", content: userMessage },
      { speaker: "analyst", content: analystOutput },
    ];
  }

  // ─── STEP 2: Deliberation loop — Cortex moderates ───
  await updateSessionPhase(sb, sessionId, "planning");

  let lastSpeaker = "";
  let consecutiveSameSpeaker = 0;
  const recentFingerprints: string[] = [];

  for (let turn = 0; turn < MAX_DELIBERATION_TURNS; turn++) {
    const userInterjection = await checkUserInterjection(sb, sessionId, round);
    if (userInterjection) {
      if (isHaltMessage(userInterjection)) {
        await insertTurn(sb, sessionId, "cortex",
          "Entendido — interrompi a deliberação. Você pode pedir mudanças ou reiniciar quando quiser.",
          "decision", "planning", round,
          { halted: true });
        await sb.from("prometheus_build_sessions").update({
          deliberation_state: { halted: true, history: deliberation, architecture: currentArchitecture },
        }).eq("id", sessionId);
        return;
      }
      deliberation.push({ speaker: "user", content: userInterjection });
      await insertTurn(sb, sessionId, "cortex",
        `O usuário acrescentou: "${userInterjection.substring(0, 100)}". Vou incorporar na discussão.`,
        "decision", "planning", round);
    }

    if (intent === "directive" && turn >= 10 && currentArchitecture) break;

    // Cortex moderator: decide who speaks next
    const historyText = deliberation.map(d =>
      `[${AGENT_DISPLAY_NAMES[d.speaker] || d.speaker}]: ${d.content}`
    ).join("\n\n");

    const moderatorInput = CORTEX_MODERATOR_PROMPT
      .replace("{deliberation_history}", historyText)
      .replace("{current_requirements}", JSON.stringify(currentReqs, null, 2).substring(0, 1500))
      .replace("{current_architecture}", currentArchitecture
        ? `Genome: ${currentArchitecture.genome_name}, Nós: ${currentArchitecture.nodes?.length || 0}`
        : "Nenhuma ainda")
      .replace("{user_intent}", intent);

    const moderatorResponse = await routeLLM({
      model_id: modelId,
      messages: [
        { role: "system", content: CORTEX_SYSTEM_PROMPT },
        { role: "user", content: moderatorInput },
      ],
      temperature: 0.4,
      max_tokens: 512,
      tenant_id: motorTenantId,
    });

    let modDecision: { next_speaker: string; instruction: string; cortex_comment?: string | null };
    try {
      const jsonMatch = moderatorResponse.content.match(/\{(?:[^{}]|\{[^{}]*\})*\}/);
      modDecision = jsonMatch ? JSON.parse(jsonMatch[0]) : { next_speaker: "done", instruction: "" };
    } catch {
      modDecision = { next_speaker: "done", instruction: "Convergência alcançada." };
    }

    if (modDecision.cortex_comment) {
      await insertTurn(sb, sessionId, "cortex",
        modDecision.cortex_comment,
        "decision", "planning", round);
      deliberation.push({ speaker: "cortex", content: modDecision.cortex_comment });
    }

    if (modDecision.next_speaker === "done") break;

    // ── user → decision fork (research-backed question only) ──
    if (modDecision.next_speaker === "user") {
      const hasResearch = researchCacheHasResults(researchCache);
      if (!hasResearch && intent === "directive") {
        modDecision.next_speaker = "architect";
        modDecision.instruction = modDecision.instruction || "Proponha arquitetura com defaults do domínio.";
      } else {
        await insertTurn(sb, sessionId, "cortex",
          modDecision.instruction || "Encontrei duas rotas viáveis — preciso da sua preferência.",
          "decision", "planning", round,
          {
            decision_fork: {
              question: modDecision.instruction,
              evidence: "Deliberação pós-pesquisa",
            },
            deliberation_paused: true,
          });
        await sb.from("prometheus_build_sessions").update({
          deliberation_state: { history: deliberation, architecture: currentArchitecture, awaiting_fork: true },
          research_cache: researchCache,
        }).eq("id", sessionId);
        return;
      }
    }

    // ── agent speaks ──
    const speaker = modDecision.next_speaker;

    if (speaker === lastSpeaker) consecutiveSameSpeaker++;
    else {
      consecutiveSameSpeaker = 0;
      lastSpeaker = speaker;
    }
    if (consecutiveSameSpeaker >= 2) break;
    const agentContent = await generateAgentContribution(
      speaker, modDecision.instruction, deliberation,
      currentReqs, currentArchitecture, modelId, motorTenantId,
    );

    const messageTypeMap: Record<string, string> = {
      architect: "architecture",
      analyst: "analysis",
      scribe: "analysis",
      sentinel: "analysis",
    };

    await insertTurn(sb, sessionId, speaker,
      agentContent,
      messageTypeMap[speaker] || "decision",
      "planning", round);

    deliberation.push({ speaker, content: agentContent });

    const fp = contentFingerprint(agentContent);
    if (recentFingerprints.includes(fp)) break;
    recentFingerprints.push(fp);
    if (recentFingerprints.length > 4) recentFingerprints.shift();

    if (speaker === "architect") {
      const freshArch = await tryGenerateArchitecture(currentReqs, modelId, architectConfig);
      if (freshArch) {
        currentArchitecture = freshArch;
        await sb.from("prometheus_build_sessions")
          .update({ architecture: freshArch })
          .eq("id", sessionId);
        // Emit architecture to frontend for live canvas
        await insertTurn(sb, sessionId, "architect",
          `Arquitetura atualizada: ${freshArch.genome_name || "Personalizado"} com ${freshArch.nodes?.length || 0} nó(s)`,
          "architecture", "planning", round,
          { architecture: freshArch });
      }
    }

    if (speaker === "analyst") {
      const updatedReqs = await tryExtractRequirements(agentContent, currentReqs, modelId, motorTenantId);
      if (updatedReqs) {
        currentReqs = { ...currentReqs, ...updatedReqs };
        await sb.from("prometheus_build_sessions")
          .update({ requirements: currentReqs })
          .eq("id", sessionId);
      }
    }
  }

  // ─── STEP 3: Ensure architecture exists ───
  if (!currentArchitecture) {
    currentArchitecture = await generateArchitecture(currentReqs as any, modelId, architectConfig);

    const nodesList = currentArchitecture.nodes.map((n: any) => `• ${n.label} (${n.type})`).join("\n");
    await insertTurn(sb, sessionId, "architect",
      `Arquitetura finalizada:\n\nGenome: ${currentArchitecture.genome_name}\nNós:\n${nodesList}\nCusto: ~$${currentArchitecture.estimated_cost_per_interaction.toFixed(4)}/interação`,
      "architecture", "planning", round,
      { architecture: currentArchitecture });

    await sb.from("prometheus_build_sessions")
      .update({ architecture: currentArchitecture })
      .eq("id", sessionId);
  }

  await writeArchitectureToFlow(sb, sessionId, currentArchitecture, currentReqs);

  // ─── STEP 4: Cortex synthesis ───
  const finalHistory = deliberation.map(d =>
    `[${AGENT_DISPLAY_NAMES[d.speaker] || d.speaker}]: ${d.content}`
  ).join("\n\n");

  const archSummary = currentArchitecture
    ? `Genome: ${currentArchitecture.genome_name}, ${currentArchitecture.nodes?.length || 0} nós, custo ~$${currentArchitecture.estimated_cost_per_interaction?.toFixed(4)}/interação`
    : "Pendente";

  const synthesisInput = CORTEX_ROUNDTABLE_SYNTHESIS_PROMPT
    .replace("{deliberation_history}", finalHistory.substring(0, 3000))
    .replace("{current_requirements}", JSON.stringify(currentReqs, null, 2).substring(0, 1500))
    .replace("{current_architecture}", archSummary)
    .replace("{user_intent}", intent);

  const synthesis = await routeLLM({
    model_id: modelId,
    messages: [
      { role: "system", content: CORTEX_SYSTEM_PROMPT },
      { role: "user", content: synthesisInput },
    ],
    temperature: 0.5,
    max_tokens: 1024,
    tenant_id: motorTenantId,
  });

  await insertTurn(sb, sessionId, "cortex",
    synthesis?.content || "Plano pronto. Aprove para iniciar a construção ou peça ajustes.",
    "decision", "approval", round,
    { awaiting_input: true });
  await updateSessionPhase(sb, sessionId, "approval");

  // Clear deliberation flag
  await sb.from("prometheus_build_sessions")
    .update({ deliberation_state: null })
    .eq("id", sessionId);
}

// ═══ INTERNAL HELPERS ═══

async function generateAgentContribution(
  speaker: string,
  instruction: string,
  history: DelibTurn[],
  requirements: Record<string, unknown>,
  architecture: any,
  modelId: string,
  tenantId?: string,
): Promise<string> {
  const historyText = history.map(d =>
    `[${AGENT_DISPLAY_NAMES[d.speaker] || d.speaker}]: ${d.content}`
  ).join("\n\n");

  const agentRole = AGENT_ROLES[speaker] || "Participante da reunião.";
  const agentName = AGENT_DISPLAY_NAMES[speaker] || speaker;

  const prompt = AGENT_DELIBERATION_PROMPT
    .replace("{agent_name}", agentName)
    .replace("{agent_role}", agentRole)
    .replace("{deliberation_history}", historyText.substring(0, 3000))
    .replace("{current_requirements}", JSON.stringify(requirements, null, 2).substring(0, 1500))
    .replace("{current_architecture}", architecture
      ? `Genome: ${architecture.genome_name}, Nós: ${architecture.nodes?.map((n: any) => n.label).join(", ")}`
      : "Nenhuma proposta ainda")
    .replace("{instruction}", instruction);

  const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
    analyst: ANALYST_SYSTEM_PROMPT,
    architect: "Você é o Architect do Prometheus, especialista em design de fluxos de agentes de IA. Projeta nós, conexões, genomes. Estima custo e latência. Responda em português brasileiro.",
    scribe: "Você é o Scribe do Prometheus, especialista em engenharia de prompts para agentes de IA. Avalia viabilidade de prompts, sugere tom e estrutura, antecipa complexidade. Responda em português brasileiro.",
    sentinel: "Você é o Sentinel do Prometheus, especialista em QA e segurança de agentes de IA. Antecipa riscos (PII, injection, edge cases), sugere testes e pontos de falha. Responda em português brasileiro.",
    cortex: CORTEX_SYSTEM_PROMPT,
  };

  const response = await routeLLM({
    model_id: modelId,
    messages: [
      { role: "system", content: AGENT_SYSTEM_PROMPTS[speaker] || CORTEX_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.6,
    max_tokens: 1024,
    tenant_id: tenantId,
  });

  return response?.content || `[${agentName}] Concordo com a equipe. Podemos avançar.`;
}

async function checkUserInterjection(
  sb: SupabaseAdmin,
  sessionId: string,
  currentRound: number,
): Promise<string | null> {
  const { data: recentTurns } = await sb
    .from("prometheus_build_turns")
    .select("content, round")
    .eq("session_id", sessionId)
    .eq("agent_key", "user")
    .gte("round", currentRound)
    .order("created_at", { ascending: false })
    .limit(1);

  if (recentTurns?.length && recentTurns[0].content) {
    return recentTurns[0].content;
  }
  return null;
}

async function tryExtractRequirements(
  agentText: string,
  existingReqs: Record<string, unknown>,
  modelId: string,
  tenantId?: string,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await analyzeRequirements(agentText, JSON.stringify(existingReqs), modelId, { tenantId });
    return result.requirements || null;
  } catch (err) {
    console.error("[deliberation] tryExtractRequirements failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function tryGenerateArchitecture(
  requirements: Record<string, unknown>,
  modelId: string,
  config?: ArchitectConfig,
): Promise<any | null> {
  try {
    return await generateArchitecture(requirements as any, modelId, config);
  } catch (err) {
    console.error("[deliberation] tryGenerateArchitecture failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function writeArchitectureToFlow(
  sb: SupabaseAdmin,
  sessionId: string,
  architecture: any,
  requirements: Record<string, unknown>,
) {
  const { data: sessionData } = await sb
    .from("prometheus_build_sessions")
    .select("target_flow_id")
    .eq("id", sessionId)
    .single();

  if (!sessionData?.target_flow_id) return;

  const { data: flowData } = await sb
    .from("agent_flows")
    .select("flow_definition")
    .eq("id", sessionData.target_flow_id)
    .single();

  const existingDef = (flowData?.flow_definition as Record<string, unknown>) || {};
  await sb.from("agent_flows").update({
    flow_definition: {
      ...existingDef,
      nodes: architecture.nodes.map((n: any, i: number) => ({
        id: n.id || `node_${i}`,
        type: n.type || "llm",
        position: { x: 250, y: i * 120 },
        data: { label: n.label, config: n.config || {} },
      })),
      edges: architecture.edges.map((e: any, i: number) => ({
        id: `edge_${i}`,
        source: e.source,
        target: e.target,
      })),
      boardroom_output: {
        genome: architecture.genome_name,
        objective: (requirements as any).objective || "",
        audience: (requirements as any).target_audience || "",
        tone: (requirements as any).tone || "",
        nodes: architecture.nodes,
        edges: architecture.edges,
        prompts: architecture.nodes
          .filter((n: any) => n.type === "llm")
          .map((n: any) => ({ nodeId: n.label, preview: `System prompt para ${n.label}` })),
        costEstimate: architecture.estimated_cost_per_interaction,
        tools: (requirements as any).tools_needed || [],
      },
    },
  }).eq("id", sessionData.target_flow_id);
}
