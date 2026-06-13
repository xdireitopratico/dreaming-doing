/**
 * prometheus-report.ts — Business plan / executive report generator
 * Step 14: Generates structured report from all build session data.
 *
 * Single LLM call with full session context → JSON report.
 * Saved to session.report for frontend display.
 */

import { routeLLM } from "./llm-router.ts";
import type { ArchitecturePlan } from "./prometheus-types.ts";
import type { SentinelReport } from "./prometheus-sentinel.ts";
import type { ToolCallLog } from "./prometheus-react-loop.ts";

// ═══ INTERFACES ═══

export interface ReportInput {
  session: {
    id: string;
    requirements?: Record<string, unknown>;
    architecture?: ArchitecturePlan;
    prompts?: Record<string, { system_prompt: string; description: string }>;
    test_results?: SentinelReport;
    tokens_used?: number;
    token_budget?: number;
    created_at?: string;
    completed_at?: string;
    quality_model?: string;
    iterations?: number;
    research_cache?: Record<string, unknown>;
  };
  toolCallLogs: ToolCallLog[];
}

export interface AgentReport {
  executive_summary: string;
  research_summary: string;
  architecture_explanation: {
    node_id: string;
    label: string;
    explanation: string;
  }[];
  integrations: {
    name: string;
    url?: string;
    status: "configured" | "needs_auth" | "suggested";
    auth_type?: "api_key" | "oauth" | "none";
    description: string;
  }[];
  test_summary: {
    pass_rate: number;
    tests_run: number;
    highlights: string[];
  };
  cost_estimate: {
    per_execution_cents: number;
    model_name: string;
    breakdown: string;
  };
  alternatives: string[];
  tokens_consumed: number;
  build_time_seconds: number;
}

// ═══ REPORT SYSTEM PROMPT ═══

const REPORT_SYSTEM_PROMPT = `Você é o gerador de relatórios do Prometheus Builder.
Seu papel é criar um "Business Plan" estruturado que explica ao usuário o que foi construído, por quê, e como funciona.

Regras:
- Linguagem clara, profissional, em PT-BR
- Seja específico sobre o que cada nó faz e por quê foi escolhido
- Destaque integrações que precisam de configuração do usuário
- Sugira melhorias realistas
- Responda APENAS com JSON válido`;

const REPORT_USER_PROMPT = `Gere o relatório executivo para este agente.

REQUISITOS:
{requirements}

ARQUITETURA ({nodeCount} nós):
{architecture}

PROMPTS (resumo):
{promptSummary}

RESULTADOS DE TESTE:
{testResults}

FERRAMENTAS USADAS DURANTE BUILD:
{toolUsage}

PESQUISAS REALIZADAS:
{researchSummary}

MÉTRICAS:
- Tokens consumidos: {tokensUsed}
- Iterações de build: {iterations}
- Modelo: {modelName}

Retorne JSON com esta estrutura EXATA:
{
  "executive_summary": "string - resumo em 2-3 frases do que o agente faz",
  "research_summary": "string - o que foi pesquisado e descoberto",
  "architecture_explanation": [{"node_id": "string", "label": "string", "explanation": "string"}],
  "integrations": [{"name": "string", "status": "configured|needs_auth|suggested", "description": "string"}],
  "test_summary": {"pass_rate": number, "tests_run": number, "highlights": ["string"]},
  "cost_estimate": {"per_execution_cents": number, "model_name": "string", "breakdown": "string"},
  "alternatives": ["string - sugestões de melhoria"]
}`;

// ═══ MAIN EXPORT ═══

export async function generateReport(
  input: ReportInput,
  modelId: string,
): Promise<AgentReport> {
  if (!modelId) {
    throw new Error("[prometheus-report] model_id is required");
  }

  const session = input.session;
  const arch = session.architecture;
  const requirements = session.requirements || {};
  const prompts = session.prompts || {};
  const testResults = session.test_results;

  // Prepare summaries for context
  const promptSummary = Object.entries(prompts)
    .map(([nodeId, p]) => `${nodeId}: ${p.description} (${p.system_prompt.substring(0, 100)}...)`)
    .join("\n");

  const testSummary = testResults
    ? `Pass rate: ${(testResults.pass_rate * 100).toFixed(0)}%, ${testResults.test_results.length} testes\n` +
      testResults.test_results.map(r => `  ${r.passed ? "✅" : "❌"} ${r.test_case.name}: ${r.eval_scores.aggregate.toFixed(2)}`).join("\n")
    : "Nenhum teste executado";

  const toolUsage = input.toolCallLogs.length > 0
    ? input.toolCallLogs.map(t => `${t.tool}: ${!t.output || !(t.output as any)?.error ? "ok" : "erro"} (${t.latency_ms}ms)`).join("\n")
    : "Nenhuma ferramenta externa usada";

  const researchSummary = session.research_cache
    ? Object.entries(session.research_cache).map(([k, v]) => `• ${k}: ${String(v).substring(0, 100)}`).join("\n")
    : "Nenhuma pesquisa realizada";

  const createdAt = session.created_at ? new Date(session.created_at).getTime() : Date.now();
  const completedAt = session.completed_at ? new Date(session.completed_at).getTime() : Date.now();
  const buildTimeSeconds = Math.round((completedAt - (isNaN(createdAt) ? Date.now() : createdAt)) / 1000);

  const userPrompt = REPORT_USER_PROMPT
    .replace("{requirements}", JSON.stringify(requirements))
    .replace("{nodeCount}", String(arch?.nodes?.length || 0))
    .replace("{architecture}", JSON.stringify(arch ? { nodes: arch.nodes.map(n => ({ id: n.id, type: n.type, label: n.label })), edges: arch.edges } : {}))
    .replace("{promptSummary}", promptSummary)
    .replace("{testResults}", testSummary)
    .replace("{toolUsage}", toolUsage)
    .replace("{researchSummary}", researchSummary)
    .replace("{tokensUsed}", String(session.tokens_used || 0))
    .replace("{iterations}", String(session.iterations || 1))
    .replace("{modelName}", session.quality_model || modelId);

  try {
    const response = await routeLLM({
      model_id: modelId,
      messages: [
        { role: "system", content: REPORT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 3000,
    });

    const jsonMatch = response.content.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
    if (!jsonMatch) return fallbackReport(input, buildTimeSeconds);

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      executive_summary: parsed.executive_summary || "Agente construído com sucesso.",
      research_summary: parsed.research_summary || "Sem pesquisa adicional.",
      architecture_explanation: parsed.architecture_explanation || [],
      integrations: parsed.integrations || [],
      test_summary: parsed.test_summary || {
        pass_rate: testResults?.pass_rate || 0,
        tests_run: testResults?.test_results?.length || 0,
        highlights: [],
      },
      cost_estimate: parsed.cost_estimate || {
        per_execution_cents: 0,
        model_name: modelId,
        breakdown: "Estimativa não disponível",
      },
      alternatives: parsed.alternatives || [],
      tokens_consumed: session.tokens_used || 0,
      build_time_seconds: buildTimeSeconds,
    };
  } catch (err) {
    console.error("[report] LLM generation failed:", err);
    return fallbackReport(input, buildTimeSeconds);
  }
}

// ═══ FALLBACK ═══

function fallbackReport(input: ReportInput, buildTimeSeconds: number): AgentReport {
  const session = input.session;
  const arch = session.architecture;
  const testResults = session.test_results;
  const requirements = session.requirements || {};

  return {
    executive_summary: `Agente de ${(requirements as any).domain || "propósito geral"} construído com ${arch?.nodes?.length || 0} nós. ${(requirements as any).objective || ""}`,
    research_summary: session.research_cache
      ? `${Object.keys(session.research_cache).length} pesquisa(s) realizadas durante a construção.`
      : "Nenhuma pesquisa externa realizada.",
    architecture_explanation: (arch?.nodes || []).map(n => ({
      node_id: n.id,
      label: n.label,
      explanation: `Nó do tipo "${n.type}" — ${n.label}`,
    })),
    integrations: [],
    test_summary: {
      pass_rate: testResults?.pass_rate || 0,
      tests_run: testResults?.test_results?.length || 0,
      highlights: testResults?.test_results
        ?.filter(r => r.passed)
        .map(r => `Passou: ${r.test_case.name}`) || [],
    },
    cost_estimate: {
      per_execution_cents: 0,
      model_name: session.quality_model || "desconhecido",
      breakdown: "Estimativa requer dados de custo do modelo.",
    },
    alternatives: [],
    tokens_consumed: session.tokens_used || 0,
    build_time_seconds: buildTimeSeconds,
  };
}
