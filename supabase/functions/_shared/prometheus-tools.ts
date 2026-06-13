/**
 * prometheus-tools.ts — 20 tools in 5 groups for Prometheus ReAct agents
 * 
 * Groups:
 *  1. Pesquisa (5): research_web, fetch_page, search_genomes, search_github, fetch_github_file
 *  2. Plataforma (5): search_tools, get_tool_schema, list_node_types, validate_graph, estimate_cost
 *  3. Implementação (6): create_http_tool, create_rag_collection, test_endpoint, execute_code, search_apis, get_tool_config
 *  4. Teste (3): execute_flow, get_execution_trace, diagnose_failure
 *  5. Discovery (1): discover_api
 * 
 * D3: Each agent sees only its relevant subset via ToolDef arrays.
 * D6: Research cache is shared per-session, passed through ToolContext.
 * D9: SSRF protection via validateExternalUrl().
 */

import type { SupabaseAdmin } from "./prometheus-db.ts";
import type { ToolDef } from "./prometheus-react-loop.ts";
import { loadMotorWebSearch } from "./motor-research.ts";
import { researchWebQuery, scrapeWebPage } from "./web-research-providers.ts";

// ═══════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════

export interface ToolContext {
  sessionId: string;
  supabase: SupabaseAdmin;
  researchCache: Record<string, unknown>;
  tenantId?: string;
}

export type ToolExecutor = (params: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

// ═══════════════════════════════════════════════════════════
// D9: SSRF PROTECTION
// ═══════════════════════════════════════════════════════════

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^fd/i,
];

export function validateExternalUrl(urlStr: string): { safe: boolean; reason?: string } {
  try {
    const url = new URL(urlStr);

    // Only allow https
    if (url.protocol !== "https:") {
      return { safe: false, reason: `Scheme "${url.protocol}" blocked. Only https:// allowed.` };
    }

    // Block IP-based hostnames directly
    const host = url.hostname;
    for (const range of PRIVATE_IP_RANGES) {
      if (range.test(host)) {
        return { safe: false, reason: `Private/reserved IP "${host}" blocked.` };
      }
    }

    // Block metadata endpoints
    if (host === "169.254.169.254" || host === "metadata.google.internal") {
      return { safe: false, reason: "Cloud metadata endpoint blocked." };
    }

    // Block localhost variants
    if (host === "localhost" || host === "0.0.0.0" || host === "[::1]") {
      return { safe: false, reason: `Localhost "${host}" blocked.` };
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: "Invalid URL format." };
  }
}

async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const check = validateExternalUrl(url);
  if (!check.safe) throw new Error(`SSRF blocked: ${check.reason}`);
  return fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
}

// ═══════════════════════════════════════════════════════════
// HELPER: Call edge function internally
// ═══════════════════════════════════════════════════════════

async function callEdgeFunction(functionName: string, body: Record<string, unknown>): Promise<unknown> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resp = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Edge function ${functionName} returned ${resp.status}: ${text}`);
  }
  return resp.json();
}

// ═══════════════════════════════════════════════════════════
// GRUPO 1: PESQUISA (5 tools — Analyst)
// ═══════════════════════════════════════════════════════════

function countResearchResults(payload: Record<string, unknown>): number {
  const direct = payload.count;
  if (typeof direct === "number") return direct;
  const results = payload.results;
  return Array.isArray(results) ? results.length : 0;
}

/** 1. research_web — Provedor único cadastrado em /api (motor). Sem cascade. */
async function researchWeb(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const query = String(params.query || "");
  if (!query) return { error: "query is required", results_count: 0 };

  const cacheKey = query.toLowerCase().trim().replace(/\s+/g, " ");
  const cached = ctx.researchCache[cacheKey] as Record<string, unknown> | undefined;
  if (cached?.result) {
    const count = countResearchResults(cached.result as Record<string, unknown>);
    return { ...(cached.result as Record<string, unknown>), from_cache: true, results_count: count };
  }

  const maxResults = Number(params.max_results) || 5;
  const ownerId = ctx.tenantId;
  if (!ownerId) {
    return {
      results: [],
      results_count: 0,
      note: "Configure um provedor de pesquisa em API Keys (/api).",
    };
  }

  const motor = await loadMotorWebSearch(ctx.supabase, ownerId);
  if (!motor.provider) {
    return {
      results: [],
      results_count: 0,
      note: "Nenhum provedor de pesquisa em /api — o motor segue só com o contexto do boardroom.",
    };
  }

  try {
    const raw = await researchWebQuery(
      { query, max_results: maxResults, provider: motor.provider },
      motor.secrets,
    );
    const count = countResearchResults(raw);
    const result = { ...raw, results_count: count, from_cache: false };
    if (count > 0) {
      ctx.researchCache[cacheKey] = { result, fetched_at: new Date().toISOString() };
    }
    return result;
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "research failed",
      results: [],
      results_count: 0,
      provider: motor.provider,
    };
  }
}

/** 2. fetch_page — HTTP direto (grátis). Sem cascade. */
async function fetchPage(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const url = String(params.url || "");
  if (!url) return { error: "url is required" };

  const check = validateExternalUrl(url);
  if (!check.safe) return { error: `URL blocked: ${check.reason}` };

  const cacheKey = `url:${url}`;
  const cached = ctx.researchCache[cacheKey] as Record<string, unknown> | undefined;
  if (cached?.result) {
    return { ...(cached.result as Record<string, unknown>), from_cache: true };
  }

  try {
    const raw = await scrapeWebPage({ url, provider: "http" }, {});
    ctx.researchCache[cacheKey] = { result: raw, fetched_at: new Date().toISOString() };
    return { ...raw, from_cache: false };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "scrape failed" };
  }
}

/** 3. search_genomes — Find similar agent genomes.
 *  No synchronous semantic-search backend is available in the edge runtime
 *  (codex search runs via Celery/Chroma offline), so this returns a clean,
 *  empty result instead of calling a decommissioned endpoint. */
async function searchGenomes(params: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
  const query = String(params.query || "");
  if (!query) return { error: "query is required" };
  return { genomes: [], note: "Nenhum genome similar indexado para busca síncrona." };
}

/** 4. search_github — Search GitHub repos via web */
async function searchGithub(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const query = String(params.query || "");
  if (!query) return { error: "query is required" };

  const result = await researchWeb({ query: `site:github.com ${query}`, max_results: 5 }, ctx);
  return result;
}

/** 5. fetch_github_file — Fetch a raw file from GitHub */
async function fetchGithubFile(params: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
  const repo = String(params.repo || "");
  const path = String(params.path || "");
  if (!repo || !path) return { error: "repo and path are required" };

  const url = `https://raw.githubusercontent.com/${repo}/main/${path}`;
  const resp = await safeFetch(url);
  const content = await resp.text();
  return { content: content.slice(0, 8000), encoding: "utf-8" };
}

// ═══════════════════════════════════════════════════════════
// GRUPO 2: PLATAFORMA (5 tools — Architect)
// ═══════════════════════════════════════════════════════════

/** 6. search_tools — Search tool_registry by name/category */
async function searchTools(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const query = String(params.query || "");
  if (!query) return { error: "query is required" };

  // Sanitize query to prevent PostgREST filter injection
  const sanitized = query.replace(/[%_(),."'\\]/g, "").trim().slice(0, 100);
  if (!sanitized) return { error: "query contains only special characters" };

  const { data, error } = await ctx.supabase
    .from("tool_registry")
    .select("name, display_name, category, input_schema, description")
    .or(`name.ilike.%${sanitized}%,display_name.ilike.%${sanitized}%,category.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
    .eq("is_active", true)
    .limit(10);

  if (error) return { error: error.message };
  return { tools: data || [] };
}

/** 7. get_tool_schema — Get full schema for a specific tool */
async function getToolSchema(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const toolName = String(params.tool_name || "");
  if (!toolName) return { error: "tool_name is required" };

  const { data, error } = await ctx.supabase
    .from("tool_registry")
    .select("name, display_name, input_schema, output_schema, executor_type, executor_config, required_secrets, description")
    .eq("name", toolName)
    .eq("is_active", true)
    .single();

  if (error) return { error: error.message };
  return data;
}

/** 8. list_node_types — Static catalog of flow node types */
function listNodeTypes(_params: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
  return Promise.resolve({
    node_types: [
      { type: "start", description: "Entry point of the flow", inputs: [], outputs: ["trigger"] },
      { type: "llm", description: "LLM text generation node (requires model_id)", inputs: ["prompt", "context"], outputs: ["response"] },
      { type: "tool", description: "Execute a registered tool", inputs: ["tool_name", "input_data"], outputs: ["result"] },
      { type: "condition", description: "Branch based on JS expression", inputs: ["expression"], outputs: ["true_branch", "false_branch"] },
      { type: "rag_search", description: "Search vector store (RAG)", inputs: ["query", "top_k"], outputs: ["chunks"] },
      { type: "http_request", description: "Make HTTP call to external API", inputs: ["url", "method", "headers", "body"], outputs: ["response"] },
      { type: "code", description: "Execute custom JavaScript code", inputs: ["code", "variables"], outputs: ["result"] },
      { type: "memory", description: "Read/write conversation memory", inputs: ["action", "key", "value"], outputs: ["data"] },
      { type: "webhook", description: "Receive external webhook trigger", inputs: ["url_path"], outputs: ["payload"] },
      { type: "timer", description: "Delay execution", inputs: ["delay_ms"], outputs: ["trigger"] },
      { type: "split", description: "Run parallel branches", inputs: ["trigger"], outputs: ["branch_a", "branch_b"] },
      { type: "merge", description: "Wait for all branches to complete", inputs: ["branch_a", "branch_b"], outputs: ["merged"] },
      { type: "transform", description: "Transform data with template", inputs: ["template", "data"], outputs: ["result"] },
      { type: "validate", description: "Validate data against schema", inputs: ["data", "schema"], outputs: ["valid", "errors"] },
      { type: "email", description: "Send email notification", inputs: ["to", "subject", "body"], outputs: ["sent"] },
      { type: "sms", description: "Send SMS notification", inputs: ["to", "body"], outputs: ["sent"] },
      { type: "end", description: "Terminal node — ends the flow", inputs: ["result"], outputs: [] },
    ],
  });
}

/** 9. validate_graph — Validate architecture graph connectivity & correctness */
function validateGraph(params: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
  const nodes = (params.nodes || []) as Array<{ id: string; type: string; config?: Record<string, unknown> }>;
  const edges = (params.edges || []) as Array<{ source: string; target: string }>;
  
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set(nodes.map(n => n.id));

  // Check start node exists
  if (!nodes.some(n => n.type === "start")) errors.push("Missing 'start' node.");
  // Check end node exists
  if (!nodes.some(n => n.type === "end")) warnings.push("No 'end' node — flow might not terminate cleanly.");

  // Check edges reference valid nodes
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Edge source "${edge.source}" does not exist.`);
    if (!nodeIds.has(edge.target)) errors.push(`Edge target "${edge.target}" does not exist.`);
  }

  // Check for orphan nodes (no incoming or outgoing edges, except start/end)
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  for (const node of nodes) {
    if (node.type !== "start" && node.type !== "end" && !connected.has(node.id)) {
      warnings.push(`Node "${node.id}" (${node.type}) is disconnected.`);
    }
  }

  // Check LLM nodes have model configuration
  for (const node of nodes) {
    if (node.type === "llm") {
      const cfg = node.config || {};
      if (!cfg.model_id && !cfg.modelId) {
        errors.push(`LLM node "${node.id}" missing model_id.`);
      }
    }
  }

  // Simple cycle detection (DFS)
  const adjList = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjList.has(edge.source)) adjList.set(edge.source, []);
    adjList.get(edge.source)!.push(edge.target);
  }
  const visited = new Set<string>();
  const inStack = new Set<string>();
  let hasCycle = false;
  function dfs(node: string) {
    if (inStack.has(node)) { hasCycle = true; return; }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    for (const neighbor of adjList.get(node) || []) dfs(neighbor);
    inStack.delete(node);
  }
  for (const node of nodes) dfs(node.id);
  if (hasCycle) warnings.push("Graph contains a cycle — make sure it's intentional (e.g., retry loop).");

  return Promise.resolve({
    valid: errors.length === 0,
    errors,
    warnings,
  });
}

/** 10. estimate_cost — Estimate cost per execution */
function estimateCost(params: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
  const nodes = (params.nodes || []) as Array<{ id: string; type: string; config?: Record<string, unknown> }>;
  const modelId = String(params.model_id || "");

  // Simple cost table (per 1K tokens, in USD cents)
  const COST_TABLE: Record<string, { in: number; out: number }> = {
    "ollama": { in: 0, out: 0 },
    "groq": { in: 0.05, out: 0.08 },
    "xai": { in: 0.3, out: 1.5 },
    "anthropic": { in: 0.3, out: 1.5 },
    "openai": { in: 0.2, out: 0.8 },
    "google": { in: 0.015, out: 0.06 },
    "openrouter": { in: 0, out: 0 },
    "nvidia": { in: 0, out: 0 },
  };

  const provider = modelId.split("/")[0] || "ollama";
  const costs = COST_TABLE[provider] || { in: 0.1, out: 0.5 };
  
  const llmNodes = nodes.filter(n => n.type === "llm");
  // Estimate: ~500 tokens in + ~300 tokens out per LLM node per execution
  const tokensInPerExec = llmNodes.length * 500;
  const tokensOutPerExec = llmNodes.length * 300;
  
  const costPerExec = (tokensInPerExec / 1000 * costs.in) + (tokensOutPerExec / 1000 * costs.out);
  
  return Promise.resolve({
    cost_per_execution_cents: Math.round(costPerExec * 1000) / 1000,
    estimated_monthly_cents: Math.round(costPerExec * 1000 * 100) / 100, // ~1000 executions/month
    llm_nodes: llmNodes.length,
    provider,
    model_id: modelId,
    breakdown: `${llmNodes.length} LLM nodes × ~800 tokens each × ${provider} pricing`,
  });
}

// ═══════════════════════════════════════════════════════════
// GRUPO 3: IMPLEMENTAÇÃO (6 tools — Scribe)
// ═══════════════════════════════════════════════════════════

/** 11. create_http_tool — Register a new HTTP tool in tool_registry */
async function createHttpTool(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const name = String(params.name || "");
  const displayName = String(params.display_name || name);
  const endpointUrl = String(params.endpoint_url || "");
  const method = String(params.method || "POST").toUpperCase();

  if (!name || !endpointUrl) return { error: "name and endpoint_url are required" };

  // Validate the endpoint URL
  const check = validateExternalUrl(endpointUrl);
  if (!check.safe) return { error: `Endpoint URL blocked: ${check.reason}` };

  const inputSchema = params.input_schema || {};
  const outputSchema = params.output_schema || {};
  const authType = params.auth_type as string | undefined;

  const { error } = await ctx.supabase.from("tool_registry").insert({
    name,
    display_name: displayName,
    executor_type: "http",
    executor_config: { endpoint_url: endpointUrl, method },
    input_schema: inputSchema,
    output_schema: outputSchema,
    required_secrets: authType ? [`${name}_key`] : [],
    is_active: true,
    category: "prometheus_created",
    description: `Auto-created by Prometheus for session ${ctx.sessionId}`,
  });

  if (error) return { error: error.message };
  return { created: true, tool_name: name };
}

/** 12. create_rag_collection — Chunk & embed texts into rag_chunks */
async function createRagCollection(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const texts = (params.texts || []) as string[];
  const metadata = (params.metadata || {}) as Record<string, unknown>;
  const flowId = String(metadata.flow_id || ctx.sessionId);

  if (!texts.length) return { error: "texts array is required" };

  // Chunk texts (max 500 chars each)
  const chunks: string[] = [];
  for (const text of texts) {
    if (text.length <= 500) {
      chunks.push(text);
    } else {
      // Split by paragraphs, then by size
      const paragraphs = text.split(/\n\n+/);
      for (const p of paragraphs) {
        if (p.length <= 500) {
          chunks.push(p);
        } else {
          // Hard split
          for (let i = 0; i < p.length; i += 450) {
            chunks.push(p.slice(i, i + 500));
          }
        }
      }
    }
  }

  // Persist chunks (max 50 at a time). Embeddings are generated offline by the
  // embedding-manager → Celery pipeline; we store the raw chunks here so they
  // can be embedded later. Never throws on embedding unavailability.
  let totalCreated = 0;
  for (let i = 0; i < chunks.length; i += 50) {
    const batch = chunks.slice(i, i + 50);
    const embeddings: number[][] = [];
    
    // Insert into rag_chunks
    const rows = batch.map((content, idx) => ({
      document_id: flowId,
      content,
      embedding: embeddings[idx] || null,
      metadata: { ...metadata, chunk_index: i + idx, source: "prometheus_builder" },
    }));

    const { error } = await ctx.supabase.from("rag_chunks").insert(rows);
    if (error) console.error("[prometheus-tools] rag insert error:", error.message);
    else totalCreated += rows.length;
  }

  return { chunks_created: totalCreated, collection_id: flowId };
}

/** 13. test_endpoint — Test an external API endpoint (D7: auth detection) */
async function testEndpoint(params: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
  const url = String(params.url || "");
  const method = String(params.method || "GET").toUpperCase();
  if (!url) return { error: "url is required" };

  try {
    const headers = (params.headers || {}) as Record<string, string>;
    const body = params.body ? JSON.stringify(params.body) : undefined;
    
    const resp = await safeFetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: method !== "GET" ? body : undefined,
    });

    const respText = await resp.text();
    const bodyPreview = respText.slice(0, 200);

    // D7: Auth detection
    let needsAuth = false;
    let authType: string | undefined;
    if (resp.status === 401 || resp.status === 403) {
      needsAuth = true;
      const wwwAuth = resp.headers.get("www-authenticate") || "";
      if (wwwAuth.toLowerCase().includes("bearer")) authType = "oauth";
      else if (wwwAuth.toLowerCase().includes("basic")) authType = "basic";
      else authType = "api_key";
    }

    return {
      status: resp.status,
      ok: resp.ok,
      needs_auth: needsAuth,
      auth_type: authType,
      body_preview: bodyPreview,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return { status: 0, ok: false, error: msg };
  }
}

/** 14. execute_code — Disabled for security (arbitrary code execution risk) */
function executeCode(_params: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
  return Promise.resolve({ error: "execute_code is disabled for security. Use deterministic conditions in node configuration instead." });
}

/** 15. search_apis — Find free APIs for a domain */
async function searchApis(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const domain = String(params.domain || "");
  if (!domain) return { error: "domain is required" };

  const result = await researchWeb({ query: `free API for ${domain} integration REST`, max_results: 5 }, ctx);
  return result;
}

/** 16. get_tool_config — Get executor config for a tool (for Scribe to configure nodes) */
async function getToolConfig(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const toolName = String(params.tool_name || "");
  if (!toolName) return { error: "tool_name is required" };

  const { data, error } = await ctx.supabase
    .from("tool_registry")
    .select("name, executor_type, executor_config, input_schema, output_schema, required_secrets")
    .eq("name", toolName)
    .eq("is_active", true)
    .single();

  if (error) return { error: error.message };
  return data;
}

// ═══════════════════════════════════════════════════════════
// GRUPO 4: TESTE (3 tools — Sentinel)
// ═══════════════════════════════════════════════════════════

/** 17. execute_flow — Run a flow through aetherforge-gateway test mode */
async function executeFlow(params: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
  const flowId = String(params.flow_id || "");
  const testInput = String(params.test_input || params.message || "");
  if (!flowId) return { error: "flow_id is required" };
  if (!testInput) return { error: "test_input is required" };

  const result = await callEdgeFunction("aetherforge-gateway", {
    action: "test",
    flow_id: flowId,
    message: testInput,
    metadata: { test_mode: true, source: "prometheus_sentinel" },
  });
  return result;
}

/** 18. get_execution_trace — Get step-by-step trace of a flow execution */
async function getExecutionTrace(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const executionId = String(params.execution_id || "");
  if (!executionId) return { error: "execution_id is required" };

  const { data, error } = await ctx.supabase
    .from("agent_execution_steps")
    .select("node_id, node_type, step_order, status, input_data, output_data, error_message, latency_ms, cost_cents")
    .eq("execution_id", executionId)
    .order("step_order", { ascending: true });

  if (error) return { error: error.message };
  return { steps: data || [], total: (data || []).length };
}

/** 19. diagnose_failure — Analyze failed execution steps */
async function diagnoseFailure(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const executionId = String(params.execution_id || "");
  if (!executionId) return { error: "execution_id is required" };

  const trace = await getExecutionTrace({ execution_id: executionId }, ctx) as { steps?: Array<Record<string, unknown>>; error?: string };
  if (trace.error) return trace;
  
  const steps = trace.steps || [];
  const failures = steps
    .filter((s: Record<string, unknown>) => s.status === "error")
    .map((s: Record<string, unknown>) => {
      const errorMsg = String(s.error_message || "Unknown error");
      let suggestion = "Verifique a configuração deste nó.";

      // Infer suggestions from error type
      if (errorMsg.includes("404")) suggestion = "API endpoint não encontrado. Verifique a URL.";
      else if (errorMsg.includes("401") || errorMsg.includes("403")) suggestion = "API requer autenticação. Configure as credenciais.";
      else if (errorMsg.includes("timeout")) suggestion = "Timeout no request. Aumente o timeout ou verifique a API.";
      else if (errorMsg.includes("model")) suggestion = "Modelo não encontrado. Verifique o model_id configurado.";
      else if (errorMsg.includes("prompt") || errorMsg.includes("system_prompt")) suggestion = "System prompt pode estar inadequado. Reescreva.";

      return {
        node_id: s.node_id,
        node_type: s.node_type,
        error: errorMsg,
        suggestion,
      };
    });

  const healthyNodes = steps.filter((s: Record<string, unknown>) => s.status === "completed").length;
  return { failures, healthy_nodes: healthyNodes, total_steps: steps.length };
}

// ═══════════════════════════════════════════════════════════
// GRUPO 5: DISCOVERY (1 tool — Architect/Scribe)
// ═══════════════════════════════════════════════════════════

/** 20. discover_api — Probe and parse OpenAPI/Swagger specs from an external URL */
async function discoverApi(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const baseUrl = String(params.url || "").replace(/\/+$/, "");
  if (!baseUrl) return { error: "url is required" };

  const check = validateExternalUrl(baseUrl);
  if (!check.safe) return { error: `URL blocked: ${check.reason}` };

  // Common OpenAPI/Swagger spec locations
  const specPaths = [
    "/openapi.json",
    "/swagger.json",
    "/api-docs",
    "/api/openapi.json",
    "/api/swagger.json",
    "/v1/openapi.json",
    "/v2/openapi.json",
    "/api/v1/openapi.json",
    "/.well-known/openapi.json",
    "/docs/openapi.json",
  ];

  let spec: Record<string, unknown> | null = null;
  let specUrl = "";

  // Try each common path
  for (const path of specPaths) {
    const candidateUrl = baseUrl + path;
    try {
      const resp = await safeFetch(candidateUrl);
      if (!resp.ok) continue;
      const contentType = resp.headers.get("content-type") || "";
      const text = await resp.text();

      // Must be JSON-parseable
      if (contentType.includes("json") || text.trim().startsWith("{")) {
        const parsed = JSON.parse(text);
        // Validate it looks like an OpenAPI/Swagger spec
        if (parsed.openapi || parsed.swagger || parsed.paths) {
          spec = parsed;
          specUrl = candidateUrl;
          break;
        }
      }
    } catch {
      // Try next path
    }
  }

  // If user provided the spec URL directly
  if (!spec) {
    try {
      const resp = await safeFetch(baseUrl);
      if (resp.ok) {
        const text = await resp.text();
        if (text.trim().startsWith("{")) {
          const parsed = JSON.parse(text);
          if (parsed.openapi || parsed.swagger || parsed.paths) {
            spec = parsed;
            specUrl = baseUrl;
          }
        }
      }
    } catch {
      // Spec not found at direct URL either
    }
  }

  if (!spec) {
    return {
      found: false,
      error: "No OpenAPI/Swagger spec found. Try providing the direct URL to the spec JSON.",
      tried_paths: specPaths.map(p => baseUrl + p),
    };
  }

  // Parse spec
  const version = String(spec.openapi || spec.swagger || "unknown");
  const info = (spec.info || {}) as Record<string, unknown>;
  const paths = (spec.paths || {}) as Record<string, Record<string, unknown>>;
  const servers = (spec.servers || []) as Array<Record<string, unknown>>;

  // Extract security schemes
  const securitySchemes: Record<string, unknown> = {};
  const components = (spec.components || spec.securityDefinitions || {}) as Record<string, unknown>;
  const schemes = (components.securitySchemes || components) as Record<string, Record<string, unknown>>;
  if (typeof schemes === "object" && schemes !== null) {
    for (const [name, scheme] of Object.entries(schemes)) {
      if (scheme && typeof scheme === "object" && ("type" in scheme || "in" in scheme)) {
        securitySchemes[name] = {
          type: scheme.type,
          in: scheme.in,
          name: scheme.name,
          scheme: scheme.scheme,
        };
      }
    }
  }

  // Extract endpoints (limit to 30 to avoid huge payloads)
  const endpoints: Array<Record<string, unknown>> = [];
  let count = 0;
  for (const [path, methods] of Object.entries(paths)) {
    if (count >= 30) break;
    if (typeof methods !== "object" || methods === null) continue;

    for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
      if (count >= 30) break;
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

      const op = operation as Record<string, unknown>;
      const parameters = (op.parameters || []) as Array<Record<string, unknown>>;

      endpoints.push({
        method: method.toUpperCase(),
        path,
        summary: op.summary || op.description || "",
        operationId: op.operationId || "",
        parameters: parameters.slice(0, 10).map(p => ({
          name: p.name,
          in: p.in,
          required: p.required || false,
          type: (p.schema as Record<string, unknown>)?.type || p.type || "string",
        })),
        has_request_body: !!op.requestBody,
        tags: op.tags || [],
      });
      count++;
    }
  }

  // Cache result
  const cacheKey = `openapi:${baseUrl}`;
  ctx.researchCache[cacheKey] = { spec_url: specUrl, endpoints_count: endpoints.length };

  return {
    found: true,
    spec_url: specUrl,
    spec_version: version,
    api_title: info.title || "Unknown",
    api_description: String(info.description || "").slice(0, 300),
    api_version: info.version || "",
    base_url: servers.length > 0 ? servers[0].url : baseUrl,
    security_schemes: securitySchemes,
    endpoints_count: endpoints.length,
    endpoints,
  };
}

// ═══════════════════════════════════════════════════════════
// TOOL REGISTRY & EXECUTOR DISPATCH
// ═══════════════════════════════════════════════════════════

const TOOL_MAP: Record<string, ToolExecutor> = {
  research_web: researchWeb,
  fetch_page: fetchPage,
  search_genomes: searchGenomes,
  search_github: searchGithub,
  fetch_github_file: fetchGithubFile,
  search_tools: searchTools,
  get_tool_schema: getToolSchema,
  list_node_types: listNodeTypes,
  validate_graph: validateGraph,
  estimate_cost: estimateCost,
  create_http_tool: createHttpTool,
  create_rag_collection: createRagCollection,
  test_endpoint: testEndpoint,
  execute_code: executeCode,
  search_apis: searchApis,
  get_tool_config: getToolConfig,
  execute_flow: executeFlow,
  get_execution_trace: getExecutionTrace,
  diagnose_failure: diagnoseFailure,
  discover_api: discoverApi,
};

/** Execute any tool by name */
export async function dispatchTool(
  toolName: string,
  params: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const executor = TOOL_MAP[toolName];
  if (!executor) throw new Error(`Unknown tool: ${toolName}`);
  return executor(params, ctx);
}

/** Create an executeTool function bound to a context */
export function createToolExecutor(ctx: ToolContext): (name: string, params: Record<string, unknown>) => Promise<unknown> {
  return (name, params) => dispatchTool(name, params, ctx);
}

// ═══════════════════════════════════════════════════════════
// D3: TOOL DEFINITIONS PER AGENT (subsets)
// ═══════════════════════════════════════════════════════════

export const ANALYST_TOOLS: ToolDef[] = [
  {
    name: "research_web",
    description: "Search web with Firecrawl (cached per session)",
    parameters: {
      query: { type: "string", description: "Search query", required: true },
      max_results: { type: "number", description: "Max results (default 5)", required: false },
    },
  },
  {
    name: "fetch_page",
    description: "Fetch and scrape a webpage by URL",
    parameters: {
      url: { type: "string", description: "URL to fetch (https only)", required: true },
    },
  },
  {
    name: "search_genomes",
    description: "Find similar agent blueprints in the Codex",
    parameters: {
      query: { type: "string", description: "What kind of agent to search for", required: true },
    },
  },
  {
    name: "search_github",
    description: "Search GitHub for relevant repositories",
    parameters: {
      query: { type: "string", description: "GitHub search query", required: true },
    },
  },
  {
    name: "fetch_github_file",
    description: "Fetch a raw file from a GitHub repository",
    parameters: {
      repo: { type: "string", description: "owner/repo format", required: true },
      path: { type: "string", description: "File path in repository", required: true },
    },
  },
];

export const ARCHITECT_TOOLS: ToolDef[] = [
  {
    name: "search_tools",
    description: "Search platform tool registry by name or category",
    parameters: {
      query: { type: "string", description: "Tool name or category to search", required: true },
    },
  },
  {
    name: "get_tool_schema",
    description: "Get full schema/config for a specific tool",
    parameters: {
      tool_name: { type: "string", description: "Exact tool name", required: true },
    },
  },
  {
    name: "list_node_types",
    description: "List all available flow node types",
    parameters: {},
  },
  {
    name: "validate_graph",
    description: "Validate a flow graph for errors",
    parameters: {
      nodes: { type: "array", description: "Array of {id, type, config} nodes", required: true },
      edges: { type: "array", description: "Array of {source, target} edges", required: true },
    },
  },
  {
    name: "estimate_cost",
    description: "Estimate cost per execution for a set of nodes",
    parameters: {
      nodes: { type: "array", description: "Array of {id, type} nodes", required: true },
      model_id: { type: "string", description: "LLM model ID for pricing", required: true },
    },
  },
  {
    name: "search_apis",
    description: "Search for free APIs for a given domain",
    parameters: {
      domain: { type: "string", description: "Domain/topic to find APIs for", required: true },
    },
  },
  {
    name: "research_web",
    description: "Search web with Firecrawl (cached per session)",
    parameters: {
      query: { type: "string", description: "Search query", required: true },
      max_results: { type: "number", description: "Max results (default 5)", required: false },
    },
  },
  {
    name: "fetch_page",
    description: "Fetch and scrape a webpage by URL",
    parameters: {
      url: { type: "string", description: "URL to fetch (https only)", required: true },
    },
  },
  {
    name: "discover_api",
    description: "Probe a URL for OpenAPI/Swagger spec and return parsed endpoints, auth, and parameters",
    parameters: {
      url: { type: "string", description: "Base URL of the API (e.g. https://api.example.com)", required: true },
    },
  },
];

export const SCRIBE_TOOLS: ToolDef[] = [
  {
    name: "get_tool_schema",
    description: "Get full schema/config for a specific tool",
    parameters: {
      tool_name: { type: "string", description: "Exact tool name", required: true },
    },
  },
  {
    name: "get_tool_config",
    description: "Get executor config for a tool",
    parameters: {
      tool_name: { type: "string", description: "Exact tool name", required: true },
    },
  },
  {
    name: "create_http_tool",
    description: "Register a new HTTP tool in the platform",
    parameters: {
      name: { type: "string", description: "Tool name (snake_case)", required: true },
      display_name: { type: "string", description: "Human-readable name", required: true },
      endpoint_url: { type: "string", description: "HTTPS endpoint URL", required: true },
      method: { type: "string", description: "HTTP method (POST/GET)", required: false },
      input_schema: { type: "object", description: "JSON Schema for inputs", required: false },
      output_schema: { type: "object", description: "JSON Schema for outputs", required: false },
      auth_type: { type: "string", description: "Auth type if required (api_key, oauth)", required: false },
    },
  },
  {
    name: "create_rag_collection",
    description: "Chunk texts and embed into RAG vector store",
    parameters: {
      texts: { type: "array", description: "Array of text strings to embed", required: true },
      metadata: { type: "object", description: "{flow_id, domain, source_urls}", required: false },
    },
  },
  {
    name: "test_endpoint",
    description: "Test an API endpoint (detects auth requirements)",
    parameters: {
      url: { type: "string", description: "HTTPS URL to test", required: true },
      method: { type: "string", description: "HTTP method (default GET)", required: false },
      headers: { type: "object", description: "Custom headers", required: false },
      body: { type: "object", description: "Request body (for POST)", required: false },
    },
  },
  {
    name: "execute_code",
    description: "Evaluate a JavaScript expression (max 500 chars, no imports)",
    parameters: {
      code: { type: "string", description: "JS expression to evaluate", required: true },
    },
  },
  {
    name: "search_apis",
    description: "Search for free APIs for a domain",
    parameters: {
      domain: { type: "string", description: "Domain to find APIs for", required: true },
    },
  },
  {
    name: "research_web",
    description: "Search web with Firecrawl (cached)",
    parameters: {
      query: { type: "string", description: "Search query", required: true },
    },
  },
  {
    name: "discover_api",
    description: "Probe a URL for OpenAPI/Swagger spec and return parsed endpoints, auth, and parameters",
    parameters: {
      url: { type: "string", description: "Base URL of the API (e.g. https://api.example.com)", required: true },
    },
  },
];

export const SENTINEL_TOOLS: ToolDef[] = [
  {
    name: "execute_flow",
    description: "Execute a flow through the gateway in test mode",
    parameters: {
      flow_id: { type: "string", description: "UUID of the flow to test", required: true },
      test_input: { type: "string", description: "Test message to send", required: true },
    },
  },
  {
    name: "get_execution_trace",
    description: "Get step-by-step trace of a flow execution",
    parameters: {
      execution_id: { type: "string", description: "Execution ID from execute_flow", required: true },
    },
  },
  {
    name: "diagnose_failure",
    description: "Analyze failed execution steps with suggestions",
    parameters: {
      execution_id: { type: "string", description: "Execution ID to diagnose", required: true },
    },
  },
];
