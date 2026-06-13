/**
 * prometheus-architect.ts — Architecture generation agent
 * Phase B5 + P22 + ReAct v2: Selects genome via SEMANTIC SEARCH,
 * customizes flow using ReAct loop with platform tools.
 * 
 * P22: Uses Ollama nomic-embed-text (via embedding-tools) to find the
 * best genome by vector similarity BEFORE falling back to heuristic scoring.
 * 
 * ReAct v2: Uses search_tools, get_tool_schema, list_node_types,
 * validate_graph, estimate_cost to research before designing.
 * 
 * CRITICAL: No hardcoded model. Uses the model_id selected by the user
 * in the power selector, passed through the entire pipeline.
 */

import { routeLLM } from "./llm-router.ts";
import type { RequirementSpec, ArchitecturePlan } from "./prometheus-types.ts";
import { runReActLoop, type ReActResult } from "./prometheus-react-loop.ts";
import { ARCHITECT_TOOLS, createToolExecutor, type ToolContext } from "./prometheus-tools.ts";
import { supabaseAdmin, type SupabaseAdmin } from "./prometheus-db.ts";

const ARCHITECT_SYSTEM_PROMPT = `Você é o Architect do Prometheus, especialista em design de fluxos de agentes de IA.

Dado um genome (template) e requisitos, você customiza o template gerando um plano arquitetural completo.

Regras:
- Mantenha a estrutura base do genome mas adapte labels, configs e modelos
- Adicione nós extras se os requisitos pedirem (ex: RAG se has_rag=true)
- Remova nós desnecessários para manter simplicidade
- Para nós LLM, use o model_id fornecido pelo usuário — nunca escolha outro modelo
- Calcule custo estimado: (tokens_input × preço_input + tokens_output × preço_output) por interação
- Responda em JSON válido`;

const ARCHITECT_PROMPT = `Customize o seguinte genome para atender os requisitos do agente.

IMPORTANTE: O modelo selecionado pelo usuário é: {{USER_MODEL_ID}}
Use este modelo em TODOS os nós LLM.

Genome base:
{genome}

Requisitos:
{requirements}

Retorne JSON:
{
  "genome_id": "string - ID do genome usado",
  "genome_name": "string - nome do genome",
  "nodes": [
    {
      "id": "string",
      "type": "trigger|llm|rag_query|conditional|output_guard|tool_call",
      "label": "string - nome descritivo",
      "config": {},
      "model_id": "string|null - DEVE ser {{USER_MODEL_ID}} para nós LLM"
    }
  ],
  "edges": [
    { "source": "string", "target": "string", "condition": "string|null" }
  ],
  "estimated_cost_per_interaction": 0.005,
  "estimated_latency_ms": 3000,
  "models_used": ["{{USER_MODEL_ID}}"]
}`;

// ═══ P22: SEMANTIC GENOME SEARCH (Ollama via embedding-tools) ═══

/**
 * Searches codex_genomes by vector similarity using Ollama nomic-embed-text.
 * Returns top matches ranked by cosine similarity.
 * Falls back gracefully if embeddings are unavailable.
 */
async function semanticGenomeSearch(
  requirements: Partial<RequirementSpec>,
  limit = 5,
  threshold = 0.3,
): Promise<{ genomes: any[]; semantic: boolean }> {
  const sb = supabaseAdmin();

  // Build a rich query from requirements
  const queryParts = [
    requirements.objective || "",
    requirements.domain ? `domínio: ${requirements.domain}` : "",
    requirements.target_audience ? `público: ${requirements.target_audience}` : "",
    requirements.tone ? `tom: ${requirements.tone}` : "",
    requirements.complexity ? `complexidade: ${requirements.complexity}` : "",
    requirements.has_rag ? "necessita RAG e busca em documentos" : "",
    requirements.channels?.length ? `canais: ${requirements.channels.join(", ")}` : "",
    requirements.tools_needed?.length ? `ferramentas: ${requirements.tools_needed.join(", ")}` : "",
  ].filter(Boolean).join(". ");

  if (!queryParts.trim()) {
    console.log("[architect-p22] No requirements text for semantic search, falling back");
    return { genomes: [], semantic: false };
  }

  try {
    // Call embedding-tools edge function to search codex
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const res = await fetch(`${supabaseUrl}/functions/v1/embedding-tools`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        tool: "search_codex",
        params: { query: queryParts, limit, threshold },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[architect-p22] Semantic search failed (${res.status}): ${errText}`);
      return { genomes: [], semantic: false };
    }

    const data = await res.json();
    const results = data.result?.results || [];

    if (results.length === 0) {
      console.log("[architect-p22] No semantic matches found, falling back to heuristic");
      return { genomes: [], semantic: false };
    }

    console.log(`[architect-p22] Semantic search returned ${results.length} genomes (top similarity: ${results[0]?.similarity?.toFixed(3) || "N/A"})`);

    // Fetch full genome data for matched IDs
    const genomeIds = results.map((r: any) => r.id);
    const { data: fullGenomes, error } = await sb
      .from("codex_genomes")
      .select("*")
      .in("id", genomeIds)
      .eq("is_active", true);

    if (error || !fullGenomes?.length) {
      console.warn("[architect-p22] Failed to fetch full genomes for semantic results");
      return { genomes: [], semantic: false };
    }

    // Order by similarity score from semantic search
    const similarityMap = new Map(results.map((r: any) => [r.id, r.similarity]));
    fullGenomes.sort((a: any, b: any) => (Number(similarityMap.get(b.id) || 0)) - (Number(similarityMap.get(a.id) || 0)));

    // Attach similarity score for logging/debugging
    for (const g of fullGenomes) {
      (g as any)._semantic_similarity = similarityMap.get((g as any).id) || 0;
    }

    return { genomes: fullGenomes, semantic: true };
  } catch (err: any) {
    console.warn(`[architect-p22] Semantic search error: ${err.message}`);
    return { genomes: [], semantic: false };
  }
}

// Score how well a genome matches requirements (heuristic fallback)
function scoreGenome(genome: any, reqs: Partial<RequirementSpec>): number {
  let score = 0;

  // Domain match
  if (genome.domain === reqs.domain) score += 30;
  else if (genome.domain === "geral") score += 10;

  // Complexity match
  if (genome.complexity === reqs.complexity) score += 20;
  else if (
    (genome.complexity === "medium" && reqs.complexity === "high") ||
    (genome.complexity === "medium" && reqs.complexity === "low")
  ) score += 10;

  // BUG 93 FIX: Check node type field directly instead of stringifying entire object
  const genomeHasRag = genome.template_nodes?.some((n: any) => n.type === "rag_query" || n.type === "rag");
  if (reqs.has_rag && genomeHasRag) score += 20;
  if (!reqs.has_rag && !genomeHasRag) score += 10;

  // Tools match
  const genomeHasTools = genome.template_nodes?.some((n: any) => n.type === "tool_call" || n.type === "tool");
  if (reqs.tools_needed?.length && genomeHasTools) score += 15;

  // Tag overlap
  const tags = genome.tags || [];
  const reqText = `${reqs.objective || ""} ${reqs.domain || ""}`.toLowerCase();
  for (const tag of tags) {
    if (reqText.includes(tag.toLowerCase())) score += 5;
  }

  return score;
}

export interface ArchitectConfig {
  sessionId: string;
  sb?: SupabaseAdmin;
  round?: number;
  researchCache?: Record<string, unknown>;
  tokenBudget?: { used: number; limit: number };
  tenantId?: string;
}

export async function generateArchitecture(
  requirements: Partial<RequirementSpec>,
  modelId: string,
  config?: ArchitectConfig,
): Promise<ArchitecturePlan & { toolCalls?: ReActResult["toolCalls"]; tokensUsed?: number }> {
  if (!modelId) {
    throw new Error("[prometheus-architect] model_id is required — no hardcoded fallback allowed");
  }

  const sb = config?.sb || supabaseAdmin();

  // ═══ P22: TRY SEMANTIC SEARCH FIRST ═══
  const { genomes: semanticGenomes, semantic: usedSemantic } = await semanticGenomeSearch(requirements);

  let bestGenome: any;
  let selectionMethod: string;

  if (usedSemantic && semanticGenomes.length > 0) {
    // Semantic search found matches — use the top one
    bestGenome = semanticGenomes[0];
    selectionMethod = `semantic (similarity: ${(bestGenome._semantic_similarity || 0).toFixed(3)})`;
    console.log(`[architect] P22 Semantic selection: ${bestGenome.genome_key} — ${selectionMethod}`);
  } else {
    // ═══ FALLBACK: Heuristic scoring (original approach) ═══
    const { data: genomes, error } = await sb
      .from("codex_genomes")
      .select("*")
      .eq("is_active", true);

    if (error || !genomes?.length) {
      console.error("[architect] Failed to fetch genomes:", error?.message);
      return fallbackPlan(requirements, modelId);
    }

    // P11: Fetch empirical performance to boost genome scoring
    const { data: perfData } = await sb
      .from("codex_empirical_performance")
      .select("genome_id, avg_quality, pass_rate, build_success")
      .order("created_at", { ascending: false })
      .limit(200);

    const perfMap = buildPerfMap(perfData || []);

    // Score and select best genome (with empirical boost)
    const scored = genomes
      .map((g: any) => ({ genome: g, score: scoreGenome(g, requirements) + (perfMap[g.id]?.boost || 0) }))
      .sort((a, b) => b.score - a.score);

    bestGenome = scored[0].genome;
    selectionMethod = `heuristic (score: ${scored[0].score}, empirical boost: ${perfMap[bestGenome.id]?.boost || 0})`;
    console.log(`[architect] Heuristic selection: ${bestGenome.genome_key} — ${selectionMethod}`);
  }

  // 3. ReAct v2: Use tools to research platform capabilities, then design
  if (config?.sessionId) {
    try {
      const ctx: ToolContext = {
        sessionId: config.sessionId,
        supabase: sb,
        researchCache: config.researchCache || {},
        tenantId: config.tenantId,
      };
      const executeTool = createToolExecutor(ctx);

      const reactPrompt = `${ARCHITECT_SYSTEM_PROMPT}

Você tem um genome selecionado e requisitos. Use as ferramentas para:
1. Pesquisar ferramentas disponíveis na plataforma (search_tools)
2. Verificar tipos de nós disponíveis (list_node_types)
3. Validar o grafo proposto (validate_graph)
4. Estimar custo (estimate_cost)

Genome base: ${bestGenome.genome_key} — ${bestGenome.name}
Template: ${JSON.stringify(bestGenome.template_nodes?.slice(0, 8))}

IMPORTANTE: modelo do usuário = ${modelId}. 
Use-o em TODOS os nós LLM.

Ao dar sua resposta final, retorne JSON:
{
  "genome_id": "${bestGenome.id}",
  "genome_name": "string",
  "nodes": [{"id":"string","type":"string","label":"string","config":{},"model_id":"string|null"}],
  "edges": [{"source":"string","target":"string","condition":"string|null"}],
  "estimated_cost_per_interaction": number,
  "estimated_latency_ms": number,
  "models_used": ["${modelId}"]
}`;

      const reactResult = await runReActLoop({
        systemPrompt: reactPrompt,
        userMessage: `Requisitos: ${JSON.stringify(requirements)}`,
        tools: ARCHITECT_TOOLS,
        modelId,
        maxSteps: 6,
        sessionId: config.sessionId,
        agentKey: "architect",
        round: config.round || 0,
        researchCache: config.researchCache,
        tokenBudget: config.tokenBudget,
        sb,
        executeTool,
      });

      if (!reactResult.error) {
        const jsonMatch = reactResult.content.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const plan = buildPlanFromParsed(parsed, bestGenome, modelId);
          return { ...plan, toolCalls: reactResult.toolCalls, tokensUsed: reactResult.tokensUsed };
        }
      }
      // If ReAct failed, fall through to legacy LLM path
      console.warn("[architect] ReAct failed, falling back to legacy LLM path");
    } catch (err) {
      console.error("[architect] ReAct error:", err);
    }
  }

  // 3b. Legacy LLM customization (no ReAct)
  try {
    const prompt = ARCHITECT_PROMPT
      .replace(/\{\{USER_MODEL_ID\}\}/g, modelId)
      .replace("{genome}", JSON.stringify({
        key: bestGenome.genome_key,
        name: bestGenome.name,
        nodes: bestGenome.template_nodes,
        edges: bestGenome.template_edges,
        default_models: bestGenome.default_models,
      }))
      .replace("{requirements}", JSON.stringify(requirements));

    const response = await routeLLM({
      model_id: modelId,
      messages: [
        { role: "system", content: ARCHITECT_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 4096,
    });

    // BUG 87 FIX: Use balanced brace matching instead of greedy regex
    const jsonMatch = response.content.match(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/);
    if (!jsonMatch) {
      return templateToPlan(bestGenome, modelId);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and ensure required fields — force user's model on all LLM nodes
    // PHASE 2 (ROADMAP-03): Add trial_model flag when model is inherited by fallback
    const plan: ArchitecturePlan = {
      genome_id: bestGenome.id,
      genome_name: parsed.genome_name || bestGenome.name,
      nodes: (parsed.nodes || bestGenome.template_nodes).map((n: any, i: number) => {
        const isLLM = n.type === "llm";
        const hasExplicitModel = isLLM && n.model_id && n.model_id !== "{{USER_MODEL_ID}}";
        return {
          id: n.id || `node_${i}`,
          type: n.type || "llm",
          label: n.label || `Node ${i}`,
          config: {
            ...(n.config || {}),
            // Mark as trial when model was inherited (not explicitly chosen by Architect)
            ...(isLLM && !hasExplicitModel ? { trial_model: true } : {}),
          },
          model_id: isLLM ? modelId : (n.model_id || null),
        };
      }),
      edges: (parsed.edges || bestGenome.template_edges).map((e: any) => ({
        source: e.source,
        target: e.target,
        condition: e.condition || undefined,
      })),
      estimated_cost_per_interaction: parsed.estimated_cost_per_interaction || bestGenome.estimated_cost_per_interaction || 0.005,
      estimated_latency_ms: parsed.estimated_latency_ms || bestGenome.estimated_latency_ms || 3000,
      models_used: [modelId],
    };

    return plan;
  } catch (err) {
    console.error("[architect] LLM customization failed:", err);
    return templateToPlan(bestGenome, modelId);
  }
}

/** Shared: Build ArchitecturePlan from parsed JSON + genome fallback */
function buildPlanFromParsed(parsed: any, genome: any, modelId: string): ArchitecturePlan {
  return {
    genome_id: genome.id || parsed.genome_id || "custom",
    genome_name: parsed.genome_name || genome.name,
    nodes: (parsed.nodes || genome.template_nodes || []).map((n: any, i: number) => {
      const isLLM = n.type === "llm";
      const hasExplicitModel = isLLM && n.model_id && n.model_id !== "{{USER_MODEL_ID}}" && n.model_id !== modelId;
      return {
        id: n.id || `node_${i}`,
        type: n.type || "llm",
        label: n.label || `Node ${i}`,
        config: {
          ...(n.config || {}),
          ...(isLLM && !hasExplicitModel ? { trial_model: true } : {}),
        },
        model_id: isLLM ? modelId : (n.model_id || null),
      };
    }),
    edges: (parsed.edges || genome.template_edges || []).map((e: any) => ({
      source: e.source,
      target: e.target,
      condition: e.condition || undefined,
    })),
    estimated_cost_per_interaction: parsed.estimated_cost_per_interaction || genome.estimated_cost_per_interaction || 0.005,
    estimated_latency_ms: parsed.estimated_latency_ms || genome.estimated_latency_ms || 3000,
    models_used: [modelId],
  };
}

// Convert a genome template directly to a plan (fallback)
// PHASE 2: All template-derived LLM nodes get trial_model: true
function templateToPlan(genome: any, modelId: string): ArchitecturePlan {
  return {
    genome_id: genome.id,
    genome_name: genome.name,
    nodes: (genome.template_nodes || []).map((n: any, i: number) => ({
      id: n.id || `node_${i}`,
      type: n.type || "llm",
      label: n.label || `Node ${i}`,
      config: { ...(n.config || {}), ...(n.type === "llm" ? { trial_model: true } : {}) },
      model_id: n.type === "llm" ? modelId : null,
    })),
    edges: (genome.template_edges || []).map((e: any) => ({
      source: e.source,
      target: e.target,
    })),
    estimated_cost_per_interaction: genome.estimated_cost_per_interaction || 0.005,
    estimated_latency_ms: genome.estimated_latency_ms || 3000,
    models_used: [modelId],
  };
}

// Ultimate fallback when no genomes available
// PHASE 2: All fallback LLM nodes get trial_model: true
export function fallbackPlan(reqs: Partial<RequirementSpec>, modelId: string): ArchitecturePlan {
  const hasRag = reqs.has_rag ?? false;
  const nodes: ArchitecturePlan["nodes"] = [
    { id: "trigger", type: "trigger", label: "Trigger", config: {} },
  ];
  const edges: ArchitecturePlan["edges"] = [];

  if (hasRag) {
    nodes.push({ id: "rag", type: "rag_query", label: "RAG Retriever", config: {} });
    edges.push({ source: "trigger", target: "rag" });
    nodes.push({ id: "llm", type: "llm", label: "LLM Principal", config: { trial_model: true }, model_id: modelId });
    edges.push({ source: "rag", target: "llm" });
  } else {
    nodes.push({ id: "llm", type: "llm", label: "LLM Principal", config: { trial_model: true }, model_id: modelId });
    edges.push({ source: "trigger", target: "llm" });
  }

  nodes.push({ id: "guard", type: "output_guard", label: "Output Guard", config: {} });
  edges.push({ source: "llm", target: "guard" });

  return {
    genome_id: "fallback",
    genome_name: "Agente Personalizado",
    nodes,
    edges,
    estimated_cost_per_interaction: hasRag ? 0.006 : 0.002,
    estimated_latency_ms: hasRag ? 3500 : 2000,
    models_used: [modelId],
  };
}

// ═══ P11: EMPIRICAL PERFORMANCE BOOST ═══

interface GenomePerfSummary {
  successCount: number;
  avgQuality: number;
  avgPassRate: number;
  boost: number;
}

function buildPerfMap(rows: any[]): Record<string, GenomePerfSummary> {
  const map: Record<string, { qualities: number[]; passRates: number[]; successes: number }> = {};

  for (const r of rows) {
    if (!r.genome_id) continue;
    if (!map[r.genome_id]) map[r.genome_id] = { qualities: [], passRates: [], successes: 0 };
    const entry = map[r.genome_id];
    if (r.build_success) entry.successes++;
    if (r.avg_quality != null) entry.qualities.push(r.avg_quality);
    if (r.pass_rate != null) entry.passRates.push(r.pass_rate);
  }

  const result: Record<string, GenomePerfSummary> = {};
  for (const [id, data] of Object.entries(map)) {
    const avgQ = data.qualities.length ? data.qualities.reduce((a, b) => a + b, 0) / data.qualities.length : 0;
    const avgP = data.passRates.length ? data.passRates.reduce((a, b) => a + b, 0) / data.passRates.length : 0;
    // Boost: up to +25 points based on empirical success
    const boost = Math.round(avgQ * 10 + avgP * 10 + Math.min(data.successes, 5));
    result[id] = { successCount: data.successes, avgQuality: avgQ, avgPassRate: avgP, boost };
  }

  return result;
}
