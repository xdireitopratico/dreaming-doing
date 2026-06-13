/**
 * prometheus-enrichment.ts — ReAct-powered prompt enrichment
 * Research-first: web search before inferring domain/config.
 * D8: Falls back to deterministic inference if ReAct fails.
 * D6: Shares researchCache with subsequent boardroom agents.
 */

import type { ReActResult } from "./prometheus-react-loop.ts";
import { runReActLoop } from "./prometheus-react-loop.ts";
import { ANALYST_TOOLS, createToolExecutor, type ToolContext } from "./prometheus-tools.ts";
import { insertTurn, type SupabaseAdmin } from "./prometheus-db.ts";

const ENRICHMENT_TOOLS = ANALYST_TOOLS.filter((t) =>
  ["research_web", "fetch_page"].includes(t.name)
);

const ENRICHMENT_SYSTEM_PROMPT = `Você pesquisa o domínio e contexto de negócio para criar um agente de IA.
USE research_web e fetch_page para entender o nicho, concorrentes e necessidades típicas ANTES de inferir.
Não faça perguntas ao usuário — pesquise e infira.

Ao finalizar, retorne JSON:
{
  "personality": "string",
  "architecture_type": "string",
  "channels": ["string"],
  "domain": "string",
  "complexity": "basic|intermediate|advanced",
  "integrations": ["string"],
  "enriched_prompt": "string - prompt expandido com contexto inferido",
  "research_summary": "string - o que você descobriu na pesquisa (2-4 frases)"
}`;

export interface EnrichmentInput {
  prompt: string;
  modelId: string;
  sessionId: string;
  sb?: SupabaseAdmin;
  researchCache?: Record<string, unknown>;
  tokenBudget?: { used: number; limit: number };
  tenantId?: string;
}

export interface EnrichmentOutput {
  personality: string;
  architecture_type: string;
  channels: string[];
  domain: string;
  complexity: string;
  integrations: string[];
  enriched_prompt: string;
  toolCalls?: ReActResult["toolCalls"];
  tokensUsed?: number;
  researchCache?: Record<string, unknown>;
  research_summary?: string;
}

function shouldRunResearch(prompt: string): boolean {
  if (!prompt || prompt.length < 10) return false;
  if (prompt.length < 200) return true;
  return /\b(advogad|jurídi|juridic|saas|vend|prospect|legal|médic|medic|financ|e-?commerce|imobili|rh\b|recrut)/i.test(prompt);
}

export async function runEnrichment(input: EnrichmentInput): Promise<EnrichmentOutput> {
  const researchCache: Record<string, unknown> = { ...(input.researchCache || {}) };
  const inferred = fallbackEnrichment(input.prompt || "");
  const prompt = input.prompt || "";

  if (shouldRunResearch(prompt) && input.sb && input.sessionId && input.modelId) {
    try {
      const ctx: ToolContext = {
        sessionId: input.sessionId,
        supabase: input.sb,
        researchCache,
        tenantId: input.tenantId,
      };
      const executeTool = createToolExecutor(ctx);

      const result = await runReActLoop({
        systemPrompt: ENRICHMENT_SYSTEM_PROMPT,
        userMessage: `Pesquise e enriqueça o contexto deste pedido de agente de IA:\n\n"""${prompt}"""`,
        tools: ENRICHMENT_TOOLS,
        modelId: input.modelId,
        maxSteps: 4,
        sessionId: input.sessionId,
        agentKey: "enrichment",
        round: 0,
        researchCache,
        tokenBudget: input.tokenBudget,
        sb: input.sb,
        executeTool,
        tenantId: input.tenantId,
      });

      if (!result.error && result.content) {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            const merged: EnrichmentOutput = {
              personality: parsed.personality || inferred.personality,
              architecture_type: parsed.architecture_type || inferred.architecture_type,
              channels: Array.isArray(parsed.channels) && parsed.channels.length
                ? parsed.channels
                : inferred.channels,
              domain: parsed.domain || inferred.domain,
              complexity: parsed.complexity || inferred.complexity,
              integrations: Array.isArray(parsed.integrations) ? parsed.integrations : inferred.integrations,
              enriched_prompt: parsed.enriched_prompt || inferred.enriched_prompt,
              research_summary: parsed.research_summary,
              researchCache: { ...researchCache },
              tokensUsed: result.tokensUsed,
              toolCalls: result.toolCalls,
            };

            const summary = merged.research_summary
              || `Domínio **${merged.domain}** · Complexidade **${merged.complexity}**`;
            await insertTurn(
              input.sb,
              input.sessionId,
              "enrichment",
              `Pesquisa concluída: ${summary}`,
              "analysis",
              "discovery",
              0,
              { research_summary: merged.research_summary, tool_calls: result.toolCalls?.length },
            ).catch((e) => console.warn("[enrichment] progress turn failed:", e));

            return merged;
          } catch { /* fall through */ }
        }
      }
    } catch (err) {
      console.warn("[enrichment] ReAct failed, using deterministic:", err);
    }
  }

  if (input.sb) {
    await insertTurn(
      input.sb,
      input.sessionId,
      "enrichment",
      `Domínio detectado: **${inferred.domain}** · Complexidade: **${inferred.complexity}** · Canais: ${inferred.channels.join(", ")}`,
      "analysis",
      "discovery",
      0,
    ).catch((e) => console.warn("[enrichment] progress turn failed:", e));
  }

  return { ...inferred, researchCache, tokensUsed: 0 };
}

function fallbackEnrichment(prompt: string): EnrichmentOutput {
  const lower = (prompt || "").toLowerCase();

  const channels: string[] = [];
  if (lower.includes("whatsapp")) channels.push("whatsapp");
  if (lower.includes("telegram")) channels.push("telegram");
  if (lower.includes("api")) channels.push("api_rest");
  if (channels.length === 0) channels.push("web_widget");

  const domain = lower.includes("jurídi") || lower.includes("juridic") || lower.includes("advogad") || lower.includes("legal") ? "legal"
    : lower.includes("vend") || lower.includes("lead") || lower.includes("comerci") || lower.includes("prospect") ? "vendas"
    : lower.includes("suport") || lower.includes("atendiment") ? "suporte"
    : lower.includes("saúde") || lower.includes("saude") || lower.includes("médic") || lower.includes("medic") ? "saude"
    : lower.includes("educ") || lower.includes("ensino") || lower.includes("curso") ? "educação"
    : lower.includes("financ") || lower.includes("banco") || lower.includes("invest") ? "financeiro"
    : lower.includes("saas") ? "saas"
    : "geral";

  const personality = lower.includes("formal") || lower.includes("técnic") || lower.includes("tecnic") ? "técnico"
    : lower.includes("amig") || lower.includes("informal") || lower.includes("casual") ? "amigável"
    : "profissional";

  const hasRag = /document|pdf|base.*conhec|rag|arquivo|manual/.test(lower);
  const hasTools = /api|integra|ferramenta|calendár|calendario|crm|pagament/.test(lower);
  const complexity = hasRag && hasTools ? "advanced" : (hasRag || hasTools) ? "intermediate" : "basic";

  const archType = hasRag ? "rag_enabled" : hasTools ? "tool_heavy" : prompt.length > 200 ? "multi_node" : "simple";

  const integrations: string[] = [];
  if (lower.includes("calendár") || lower.includes("calendario") || lower.includes("agenda")) integrations.push("calendário");
  if (lower.includes("crm") || lower.includes("cliente")) integrations.push("CRM");
  if (lower.includes("pagament") || lower.includes("stripe")) integrations.push("pagamento");
  if (lower.includes("email") || lower.includes("e-mail")) integrations.push("email");
  if (lower.includes("linkedin")) integrations.push("LinkedIn");

  return {
    personality,
    architecture_type: archType,
    channels,
    domain,
    complexity,
    integrations,
    enriched_prompt: prompt,
  };
}