/**
 * AetherForge Gateway — Core (Facade)
 * R57: Executores extraídos para executor-*.ts
 * Este arquivo re-exporta tudo para manter compatibilidade com imports existentes.
 */

import { evaluateCondition, type ConditionConfig } from "./condition-evaluator.ts";
import { applyOutputGuards, type GuardConfig } from "./output-guards.ts";
import { checkAllProviders } from "./provider-health.ts";

// Re-export executors from dedicated files
export { executeLLMNode } from "./executor-llm.ts";
export { executeToolNode } from "./executor-tool.ts";
export { executeMemoryNode } from "./executor-memory.ts";
export { executeSubFlowNode } from "./executor-subflow.ts";
export { executeVisionNode } from "./executor-vision.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-aetherforge-api-key",
};

/**
 * HITL Pause Signal — thrown when a HITL node is reached
 */
export class HITLPauseSignal extends Error {
  timeoutMinutes: number;
  pauseMessage: string;
  fallbackAction: string;
  constructor(timeoutMinutes: number, message: string, fallbackAction: string) {
    super("HITL_PAUSE");
    this.timeoutMinutes = timeoutMinutes;
    this.pauseMessage = message;
    this.fallbackAction = fallbackAction;
  }
}

/**
 * Inline node executor (non-LLM nodes)
 */
export function executeNodeInline(node: any, input: any, originalMessage: string): any {
  const config = node.data?.config || {};
  const nodeType = node.type;

  switch (nodeType) {
    case "trigger":
      return { message: originalMessage, channel: input.channel || "web", session_id: crypto.randomUUID(), metadata: input.metadata || {} };
    case "llm":
      console.warn(`[Gateway] LLM node ${node.id} hit inline fallback — model: ${config.model_id || config.model || "none"}`);
      return { response: "Desculpe, não consegui processar sua mensagem no momento. Tente novamente.", model: config.model_id || config.model || "unknown", tokens: { prompt: 0, completion: 0, total: 0 }, fallback: true };
    case "tool":
      console.warn(`[Gateway] Tool node ${node.id} hit inline fallback — tool: ${config.tool_name || "none"}`);
      return { tool_name: config.tool_name || "unknown", status: "error", result: null, error: "Ferramenta indisponível no momento.", fallback: true };
    case "condition": {
      const condResult = evaluateCondition(input, config as ConditionConfig);
      console.log(`[Gateway/Condition] ${condResult.expression} → ${condResult.branch} (field=${JSON.stringify(condResult.field_value)})`);
      return condResult;
    }
    case "output_guard": {
      const guardRules = config.guard_config || { enabled: true, rules: (config.rules || ["pii_mask"]).map((r: string) => ({ id: r, enabled: true })) };
      const guardResult = applyOutputGuards(input.response || input.text || input.message || originalMessage, guardRules as GuardConfig);
      return { filtered: guardResult.was_modified, blocked: guardResult.was_blocked, rules_applied: guardResult.rules_applied, rules_blocked: guardResult.rules_blocked, text: guardResult.filtered_text, response: guardResult.filtered_text, block_reason: guardResult.block_reason };
    }
    case "stt":
      return { text: input.audio_text || originalMessage, confidence: 0.95, language: config.language || "pt-BR", engine: "inline_fallback" };
    case "tts":
      return { audio_url: null, text: input.response || input.text || originalMessage, voice: config.voice || "pf_dora", engine: "inline_fallback" };
    case "rag_search":
      return { chunks: ["Chunk relevante encontrado..."], sources: ["knowledge_base"], top_k: config.top_k || 5 };
    case "memory":
      return { operation: config.operation || "read", key: config.key || "default", value: null, engine: "inline_fallback" };
    case "hitl":
      throw new HITLPauseSignal(config.timeout_minutes || 60, config.message || "Aguardando aprovação", config.fallback_action || "abort");
    case "loop":
      return { iteration: 1, max: config.max_iterations || 10, completed: true };
    case "switch":
      return { matched_case: (config.cases || ["case_1", "default"])[0], value: input };
    case "delay":
      return { waited_seconds: config.seconds || 5 };
    case "sub_flow":
      return { flow_name: config.flow_name || "unknown", status: "pending_real_execution", output: {}, note: "Use executeSubFlowNode for real invocation" };
    case "vision":
      console.warn(`[Gateway] Vision node ${node.id} hit inline fallback`);
      return { response: "Análise visual indisponível no momento.", model: config.model_id || "unknown", fallback: true };
    case "transformer":
      return { transformed: JSON.stringify(input).toUpperCase() };
    case "error_handler":
      return { error: null, status: "healthy", retry_count: config.retry_count || 3 };
    default:
      return { raw_input: input, node_type: nodeType };
  }
}

/**
 * Health check endpoint
 */
export async function handleHealthCheck(): Promise<Response> {
  try {
    const healthResult = await checkAllProviders();
    return new Response(JSON.stringify(healthResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Health check failed", detail: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
