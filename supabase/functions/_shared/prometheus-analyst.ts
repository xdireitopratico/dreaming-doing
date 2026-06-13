/**
 * prometheus-analyst.ts â€” Requirement extraction agent
 * Phase P6 + ReAct v2: Extracts structured requirements using ReAct loop
 * with web research, genome search, and GitHub discovery.
 * 
 * CRITICAL: No hardcoded model. Uses the model_id selected by the user
 * in the power selector, passed through the entire pipeline.
 * D8: Falls back to deterministic fallbackAnalysis() if ReAct fails.
 */

import { routeLLM } from "./llm-router.ts";
import { ANALYST_SYSTEM_PROMPT, ANALYST_EXTRACTION_PROMPT } from "./prometheus-prompts.ts";
import type { RequirementSpec, ClarificationQuestion } from "./prometheus-types.ts";
import { runReActLoop, type ReActResult } from "./prometheus-react-loop.ts";
import { ANALYST_TOOLS, createToolExecutor, type ToolContext } from "./prometheus-tools.ts";
import { supabaseAdmin, wrapUserInput, type SupabaseAdmin } from "./prometheus-db.ts";

export interface AnalystResult {
  requirements: Partial<RequirementSpec>;
  clarification_questions: ClarificationQuestion[];
  is_complete: boolean;
  toolCalls?: ReActResult["toolCalls"];
  tokensUsed?: number;
}

/** Strip generic questions; keep only research-backed forks. */
export function sanitizeAnalystResult(
  result: AnalystResult,
  hasResearchEvidence: boolean,
): AnalystResult {
  if (result.is_complete) {
    return { ...result, clarification_questions: [] };
  }

  const STUPID_IDS = new Set(["channels", "tools", "tone"]);
  const questions = (result.clarification_questions || []).filter((q) => {
    if (STUPID_IDS.has(q.id)) return false;
    if (!hasResearchEvidence) return false;
    const evidence = (q as ClarificationQuestion & { evidence_from_research?: string }).evidence_from_research;
    return typeof evidence === "string" && evidence.trim().length >= 20;
  });

  if (questions.length === 0) {
    return { ...result, clarification_questions: [], is_complete: true };
  }

  return { ...result, clarification_questions: questions.slice(0, 1) };
}

export interface AnalystConfig {
  sessionId: string;
  sb?: SupabaseAdmin;
  round?: number;
  researchCache?: Record<string, unknown>;
  tokenBudget?: { used: number; limit: number };
  tenantId?: string;
}

export async function analyzeRequirements(
  userInput: string,
  briefingContext: string = "{}",
  modelId: string,
  config?: AnalystConfig,
): Promise<AnalystResult> {
  if (!modelId) {
    throw new Error("[prometheus-analyst] model_id is required â€” no hardcoded fallback allowed");
  }

  // If no config (backward compat), use legacy single-call path
  if (!config?.sessionId) {
    return analyzeRequirementsLegacy(userInput, briefingContext, modelId, config?.tenantId);
  }

  // â•â•â• ReAct v2: Use tools for real research â•â•â•
  const sb = config.sb || supabaseAdmin();
  const ctx: ToolContext = {
    sessionId: config.sessionId,
    supabase: sb,
    researchCache: config.researchCache || {},
    tenantId: config.tenantId,
  };
  const executeTool = createToolExecutor(ctx);

  const reactSystemPrompt = `${ANALYST_SYSTEM_PROMPT}

VocÃª analisa o pedido do usuÃ¡rio e extrai requisitos estruturados.
USE as ferramentas para pesquisar sobre o domÃ­nio ANTES de responder.
Pesquise para entender o nicho, as necessidades tÃ­picas, e enriquecer os requisitos.

Ao dar sua resposta final, inclua JSON com esta estrutura:
{
  "requirements": {
    "objective": "string",
    "target_audience": "string",
    "channels": ["string"],
    "integrations": ["string"],
    "tone": "string",
    "domain": "string",
    "complexity": "low|medium|high",
    "constraints": ["string"],
    "tools_needed": ["string"],
    "has_rag": boolean,
    "auto_healing": boolean
  },
  "clarification_questions": [{"id":"string","question":"string","options":["string"],"required":boolean}],
  "is_complete": boolean
}`;

  const userMessage = `Contexto existente: ${briefingContext}

Pedido do usuÃ¡rio: ${wrapUserInput(userInput)}

Pesquise sobre o domÃ­nio se necessÃ¡rio, depois extraia requisitos completos em JSON.`;

  try {
    const result = await runReActLoop({
      systemPrompt: reactSystemPrompt,
      userMessage,
      tools: ANALYST_TOOLS,
      modelId,
      maxSteps: 6,
      sessionId: config.sessionId,
      agentKey: "analyst",
      round: config.round || 0,
      researchCache: config.researchCache,
      tokenBudget: config.tokenBudget,
      sb,
      executeTool,
      tenantId: config.tenantId,
    });

    // D8: If ReAct returned an error, fall back to deterministic
    if (result.error) {
      console.warn("[prometheus-analyst] ReAct failed with error, falling back to deterministic");
      const fb = fallbackAnalysis(userInput);
      return { ...fb, toolCalls: result.toolCalls, tokensUsed: result.tokensUsed };
    }

    // Parse structured requirements from the response
    const jsonMatch = result.content.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          requirements: parsed.requirements || {},
          clarification_questions: (parsed.clarification_questions || []).slice(0, 3),
          is_complete: parsed.is_complete ?? false,
          toolCalls: result.toolCalls,
          tokensUsed: result.tokensUsed,
        };
      } catch { /* fall through to fallback */ }
    }

    // If no JSON parseable, use fallback enriched with raw content
    const fb = fallbackAnalysis(userInput);
    return { ...fb, toolCalls: result.toolCalls, tokensUsed: result.tokensUsed };
  } catch (err) {
    console.error("[prometheus-analyst] ReAct error:", err);
    return fallbackAnalysis(userInput);
  }
}

/** Legacy single-call path (backward compat for deliberation etc.) */
async function analyzeRequirementsLegacy(
  userInput: string,
  briefingContext: string,
  modelId: string,
  tenantId?: string,
): Promise<AnalystResult> {
  const prompt = ANALYST_EXTRACTION_PROMPT
    .replace("{briefing}", briefingContext)
    .replace("{user_input}", userInput);

  try {
    const response = await routeLLM({
      model_id: modelId,
      messages: [
        { role: "system", content: ANALYST_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
      tenant_id: tenantId,
    });

    const jsonMatch = response.content.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
    if (!jsonMatch) {
      return fallbackAnalysis(userInput);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      requirements: parsed.requirements || {},
      clarification_questions: (parsed.clarification_questions || []).slice(0, 3),
      is_complete: parsed.is_complete ?? false,
    };
  } catch (err) {
    console.error("[prometheus-analyst] Error:", err);
    return fallbackAnalysis(userInput);
  }
}

// Deterministic fallback when LLM fails
function fallbackAnalysis(input: string): AnalystResult {
  const lower = input.toLowerCase();

  const channels: string[] = [];
  if (lower.includes("whatsapp")) channels.push("whatsapp");
  if (lower.includes("web") || lower.includes("widget")) channels.push("web_widget");
  if (lower.includes("api")) channels.push("api_rest");
  if (lower.includes("telegram")) channels.push("telegram");
  if (channels.length === 0) channels.push("web_widget");

  const domain = lower.includes("jurÃ­di") || lower.includes("advogad") || lower.includes("legal") ? "legal"
    : lower.includes("vend") || lower.includes("lead") || lower.includes("comerci") ? "vendas"
    : lower.includes("suport") || lower.includes("atendiment") ? "suporte"
    : lower.includes("saÃºde") || lower.includes("mÃ©dic") ? "saude"
    : "geral";

  // BUG 113 FIX: Remove redundant /i flag since string is already lowercased
  const hasRag = /document|pdf|base.*conhec|rag|arquivo|manual/.test(lower);

  const integrations: string[] = [];
  if (lower.includes("crm")) integrations.push("CRM");
  if (lower.includes("linkedin")) integrations.push("LinkedIn");
  if (lower.includes("email")) integrations.push("email");
  if (lower.includes("calend")) integrations.push("calendário");

  const tools_needed: string[] = [];
  if (domain === "vendas" || lower.includes("prospect")) tools_needed.push("prospecting", "email_outreach");
  if (lower.includes("linkedin")) tools_needed.push("linkedin_search");

  return {
    requirements: {
      objective: input.slice(0, 300),
      target_audience: domain === "legal" ? "Advogados e escritórios jurídicos"
        : domain === "vendas" ? "Prospects e leads comerciais"
        : "Usuários finais",
      channels,
      integrations,
      tone: "profissional",
      domain,
      complexity: input.length > 200 ? "high" : input.length > 80 ? "medium" : "low",
      constraints: domain === "legal" ? ["LGPD", "comunicação ética OAB"] : [],
      tools_needed,
      has_rag: hasRag,
      auto_healing: true,
    },
    clarification_questions: [],
    is_complete: true,
  };
}
