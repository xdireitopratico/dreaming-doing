/**
 * Data / control node executors — RAG, transformer, delay, loop, error_handler, switch
 */
import { executeTool } from "./tool-executor.ts";

function resolveTemplate(template: string, input: Record<string, unknown>, originalMessage: string): string {
  let result = template;
  const flat: Record<string, string> = { message: originalMessage, user_message: originalMessage };

  const merge = (obj: Record<string, unknown>, prefix = "") => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v != null && typeof v === "object" && !Array.isArray(v)) {
        merge(v as Record<string, unknown>, key);
      } else {
        flat[key] = String(v ?? "");
      }
    }
  };
  if (input && typeof input === "object") merge(input as Record<string, unknown>);

  for (const [k, v] of Object.entries(flat)) {
    result = result.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi"), v);
    result = result.replace(new RegExp(`\\{\\{\\s*input\\.${k}\\s*\\}\\}`, "gi"), v);
  }
  return result;
}

export async function executeRagSearchNode(
  node: any,
  input: any,
  flowId: string,
  executionId: string,
  originalMessage: string,
): Promise<any> {
  const config = node.data?.config || {};
  const query = input?.query || input?.text || input?.message || originalMessage;
  if (!query || !String(query).trim()) {
    return { chunks: [], sources: [], error: "rag_search requires a query", status: "error" };
  }

  const toolResult = await executeTool({
    tool_name: "rag_search",
    input_data: {
      query: String(query),
      top_k: config.top_k ?? 5,
      match_threshold: config.threshold ?? config.match_threshold ?? 0.5,
    },
    execution_id: executionId,
    tenant_id: flowId,
  });

  if (toolResult.status !== "success") {
    return {
      chunks: [],
      sources: [],
      error: toolResult.error || "rag_search failed",
      status: "error",
    };
  }

  const chunks = (toolResult.result?.chunks || []) as Array<Record<string, unknown>>;
  return {
    chunks,
    sources: chunks.map((c) => c.document_id).filter(Boolean),
    relevance_scores: chunks.map((c) => c.similarity),
    top_k: config.top_k ?? 5,
    query: String(query),
    source: toolResult.result?.source || "search_rag_chunks",
    status: "success",
  };
}

export async function executeDelayNode(node: any, input: any, testMode = false): Promise<any> {
  const config = node.data?.config || {};
  const requested = Number(config.seconds) || 5;
  const maxSeconds = testMode ? 2 : 300;
  const seconds = Math.min(Math.max(requested, 0), maxSeconds);
  if (seconds > 0) {
    await new Promise((r) => setTimeout(r, seconds * 1000));
  }
  return { completed: true, waited_seconds: seconds, ...(typeof input === "object" ? input : { value: input }) };
}

export function executeTransformerNode(node: any, input: any, originalMessage: string): any {
  const config = node.data?.config || {};
  const template = String(config.template || "");
  const baseInput = typeof input === "object" && input ? input : { value: input };

  if (!template.trim()) {
    return { transformed: JSON.stringify(baseInput), data: baseInput };
  }

  const transformed = resolveTemplate(template, baseInput as Record<string, unknown>, originalMessage);
  return {
    transformed,
    text: transformed,
    response: transformed,
    data: baseInput,
  };
}

export function executeLoopNode(
  node: any,
  input: any,
  loopCounters: Map<string, number>,
): any {
  const config = node.data?.config || {};
  const maxIterations = Number(config.max_iterations) || 10;
  const prev = loopCounters.get(node.id) || 0;
  const iteration = prev + 1;
  loopCounters.set(node.id, iteration);

  const items = Array.isArray(input?.items) ? input.items : null;
  if (items?.length) {
    const itemIndex = iteration - 1;
    if (itemIndex < items.length) {
      const results = Array.isArray(input?.results) ? [...input.results] : [];
      return {
        iteration,
        max_iterations: items.length,
        completed: false,
        current_item: items[itemIndex],
        item_index: itemIndex,
        total_items: items.length,
        results,
        items,
      };
    }
    loopCounters.delete(node.id);
    return {
      iteration,
      iteration_count: items.length,
      completed: true,
      results: input?.results || [],
      items,
    };
  }

  const completed = iteration >= maxIterations;
  if (completed) loopCounters.delete(node.id);

  return {
    iteration,
    max_iterations: maxIterations,
    iteration_count: iteration,
    completed,
    ...(typeof input === "object" ? input : { value: input }),
  };
}

export function executeErrorHandlerNode(node: any, input: any): any {
  const config = node.data?.config || {};
  const hasError = Boolean(input?.error) || input?.status === "error";
  const retryCount = Number(config.retry_count) || 3;
  const fallback = String(config.fallback || "log_skip");

  if (!hasError) {
    return {
      recovery_action: "pass_through",
      status: "healthy",
      retry_count: retryCount,
      output: input,
    };
  }

  return {
    recovery_action: fallback,
    fallback_response: config.fallback_response
      || "Não foi possível concluir esta etapa. Tente novamente em instantes.",
    error: input?.error || "unknown_error",
    status: fallback === "retry" ? "retry" : "recovered",
    retry_count: retryCount,
  };
}

export function executeSwitchNode(node: any, input: any): any {
  const config = node.data?.config || {};
  const cases = (config.cases as string[]) || ["default"];
  const field = config.field || "branch";
  const value = input?.[field] ?? input?.value ?? input?.branch ?? input?.message ?? input?.text;

  let matchedIndex = cases.findIndex((c) => c !== "default" && String(c) === String(value));
  if (matchedIndex < 0) {
    matchedIndex = cases.indexOf("default");
    if (matchedIndex < 0) matchedIndex = 0;
  }

  return {
    matched_case: cases[matchedIndex] || "default",
    case_index: matchedIndex,
    value,
    branch: `case_${matchedIndex}`,
  };
}