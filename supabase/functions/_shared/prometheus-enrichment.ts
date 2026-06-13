/**
 * prometheus-enrichment.ts — ReAct-powered prompt enrichment
 * Replaces the 4-step wizard (personality, architecture_type, channels, review)
 * with a single ReAct call that researches the domain and infers everything.
 * 
 * D8: Falls back to deterministic inference if ReAct fails.
 * D6: Shares researchCache with subsequent boardroom agents.
 */

import type { ReActResult } from "./prometheus-react-loop.ts";
import { supabaseAdmin, insertTurn, type SupabaseAdmin } from "./prometheus-db.ts";

export interface EnrichmentInput {
  prompt: string;       // User's raw text (min 10 chars)
  modelId: string;      // Model selected by user
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
}
export async function runEnrichment(input: EnrichmentInput): Promise<EnrichmentOutput> {
  const researchCache = input.researchCache || {};

  // ──────────────────────────────────────────────────────────────────────
  // DETERMINISTIC ENRICHMENT (synchronous, zero-network, zero-LLM-cost)
  //
  // The previous ReAct-based enrichment depended on web research and a genome
  // semantic search that have no reliable synchronous backend in the edge
  // runtime. That added latency, token cost and — critically — could leave the
  // discovery phase frozen if the background isolate was recycled mid-research.
  //
  // The fields enrichment must produce (domain, complexity, channels,
  // personality, architecture_type, integrations, enriched_prompt) are all
  // inferable directly from the user's prompt. We do that here instantly and
  // reliably, so discovery ALWAYS advances to the analyst phase.
  // ──────────────────────────────────────────────────────────────────────
  const inferred = fallbackEnrichment(input.prompt || "");

  // Best-effort progress turn — never blocks or fails the pipeline.
  if (input.sb) {
    await insertTurn(
      input.sb,
      input.sessionId,
      "enrichment",
      `Domínio detectado: **${inferred.domain}** · Complexidade: **${inferred.complexity}** · Canais: ${inferred.channels.join(", ")}`,
      "analysis",
      "discovery",
      0,
    ).catch((e) => console.warn("[enrichment] progress turn failed (non-fatal):", e));
  }

  return { ...inferred, researchCache, tokensUsed: 0 };
}

/** D8: Deterministic fallback when ReAct fails */
function fallbackEnrichment(prompt: string): EnrichmentOutput {
  const lower = (prompt || "").toLowerCase();

  // Detect channels
  const channels: string[] = [];
  if (lower.includes("whatsapp")) channels.push("whatsapp");
  if (lower.includes("telegram")) channels.push("telegram");
  if (lower.includes("api")) channels.push("api_rest");
  if (channels.length === 0) channels.push("web_widget");

  // Detect domain
  const domain = lower.includes("jurídi") || lower.includes("advogad") || lower.includes("legal") ? "legal"
    : lower.includes("vend") || lower.includes("lead") || lower.includes("comerci") ? "vendas"
    : lower.includes("suport") || lower.includes("atendiment") ? "suporte"
    : lower.includes("saúde") || lower.includes("médic") ? "saude"
    : lower.includes("educ") || lower.includes("ensino") || lower.includes("curso") ? "educação"
    : lower.includes("financ") || lower.includes("banco") || lower.includes("invest") ? "financeiro"
    : "geral";

  // Detect personality
  const personality = lower.includes("formal") || lower.includes("técnic") ? "técnico"
    : lower.includes("amig") || lower.includes("informal") || lower.includes("casual") ? "amigável"
    : "profissional";

  // Detect complexity
  const hasRag = /document|pdf|base.*conhec|rag|arquivo|manual/.test(lower);
  const hasTools = /api|integra|ferramenta|calendár|crm|pagament/.test(lower);
  const complexity = hasRag && hasTools ? "advanced" : (hasRag || hasTools) ? "intermediate" : "basic";

  // Architecture type
  const archType = hasRag ? "rag_enabled" : hasTools ? "tool_heavy" : prompt.length > 200 ? "multi_node" : "simple";

  // Integrations
  const integrations: string[] = [];
  if (lower.includes("calendár") || lower.includes("agenda")) integrations.push("calendário");
  if (lower.includes("crm") || lower.includes("cliente")) integrations.push("CRM");
  if (lower.includes("pagament") || lower.includes("stripe")) integrations.push("pagamento");
  if (lower.includes("email") || lower.includes("e-mail")) integrations.push("email");

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
