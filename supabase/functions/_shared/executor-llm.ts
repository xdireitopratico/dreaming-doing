/**
 * LLM Node Executor — Extracted from gateway-core.ts (R57)
 * ROADMAP-03 Phase 4: Loads birth memory for agent self-awareness
 */
import { routeLLM, type LLMResponse } from "./llm-router.ts";
import { manageContextWindow } from "./context-window-manager.ts";
import { executeMemory } from "./memory-manager.ts";

// Cache birth context per flow to avoid repeated DB reads within same execution
const birthCache = new Map<string, string | null>();

async function loadBirthPreamble(flowId: string): Promise<string | null> {
  if (birthCache.has(flowId)) return birthCache.get(flowId) || null;
  try {
    const result = await executeMemory({
      flow_id: flowId,
      session_id: "birth",
      operation: "read",
      key: "birth_context",
      scope: "long_term",
    });
    if (result.success && result.value) {
      const v = result.value;
      const preamble = `[IDENTIDADE] Você é "${v.agent_name || "Agente IA"}". ` +
        `Propósito: ${v.objective || "assistente geral"}. ` +
        `Domínio: ${v.domain || "geral"}. ` +
        `Tom: ${v.tone || "profissional"}. ` +
        `Público: ${v.audience || "geral"}.`;
      birthCache.set(flowId, preamble);
      return preamble;
    }
  } catch { /* non-fatal */ }
  birthCache.set(flowId, null);
  return null;
}

export async function executeLLMNode(node: any, input: any, originalMessage: string, flowId: string): Promise<any> {
  const config = node.data?.config || {};
  const modelId = config.model_id || config.model || "";
  const fallbackModelId = config.fallback_model_id || "";

  if (!modelId) {
    return {
      response: "Modelo LLM não configurado neste nó. Abra o FlowBuilder, selecione o nó e configure um modelo antes de executar.",
      model: "none",
      tokens: { prompt: 0, completion: 0, total: 0 },
      error: "MODEL_NOT_CONFIGURED",
      error_pt: "Nenhum modelo LLM configurado. Configure o modelo no nó antes de testar.",
    };
  }

  const messages: Array<{ role: string; content: string }> = [];

  // PHASE 4 (ROADMAP-03): Inject birth context if system_prompt doesn't already contain identity
  let systemPrompt = config.system_prompt || "";
  if (systemPrompt && !systemPrompt.includes("IDENTIDADE DO AGENTE") && !systemPrompt.includes("[IDENTIDADE]")) {
    const birthPreamble = await loadBirthPreamble(flowId);
    if (birthPreamble) {
      systemPrompt = birthPreamble + "\n\n" + systemPrompt;
    }
  }
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });

  if (input.conversation_history && Array.isArray(input.conversation_history)) messages.push(...input.conversation_history);

  const userContent = config.user_prompt_template
    ? config.user_prompt_template.replace(/\{\{message\}\}/g, originalMessage).replace(/\{\{input\}\}/g, JSON.stringify(input))
    : (input.response || input.text || input.message || originalMessage);

  messages.push({ role: "user", content: userContent });

  const maxTokens = config.max_tokens ?? 1024;
  const contextResult = manageContextWindow(modelId, messages, maxTokens);

  if (contextResult.wasCompressed) {
    console.log(`[Gateway] Context compressed for ${modelId}: ${contextResult.originalTokens} → ${contextResult.compressedTokens} tokens (${Math.round(contextResult.compressionRatio * 100)}%)`);
  }

  // Try primary model
  try {
    const result: LLMResponse = await routeLLM({
      model_id: modelId,
      messages: contextResult.messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: maxTokens,
      tenant_id: flowId,
    });

    return {
      response: result.content, model: result.model, provider: result.provider,
      tokens: { prompt: result.tokens_in, completion: result.tokens_out, total: result.tokens_in + result.tokens_out },
      latency_ms: result.latency_ms, cost_cents: result.cost_cents, finish_reason: result.finish_reason,
      context_compressed: contextResult.wasCompressed,
      context_tokens: { original: contextResult.originalTokens, compressed: contextResult.compressedTokens, max: contextResult.maxContextTokens },
    };
  } catch (primaryErr: any) {
    console.error(`[Gateway] LLM primary failed (${modelId}):`, primaryErr.message);

    // Humanized error for missing API keys
    const provider = modelId.split("/")[0] || "desconhecido";
    const isMissingKey = /api.?key|unauthorized|401|403|invalid.*key/i.test(primaryErr.message);
    const humanError = isMissingKey
      ? `Chave de API não encontrada para o provedor "${provider}". Configure nas Configurações > Secrets.`
      : primaryErr.message;

    // Try fallback model if configured
    if (fallbackModelId) {
      console.log(`[Gateway] Attempting fallback model: ${fallbackModelId}`);
      try {
        const fallbackResult: LLMResponse = await routeLLM({
          model_id: fallbackModelId,
          messages: contextResult.messages,
          temperature: config.temperature ?? 0.7,
          max_tokens: maxTokens,
          tenant_id: flowId,
        });

        return {
          response: fallbackResult.content, model: fallbackResult.model, provider: fallbackResult.provider,
          tokens: { prompt: fallbackResult.tokens_in, completion: fallbackResult.tokens_out, total: fallbackResult.tokens_in + fallbackResult.tokens_out },
          latency_ms: fallbackResult.latency_ms, cost_cents: fallbackResult.cost_cents, finish_reason: fallbackResult.finish_reason,
          context_compressed: contextResult.wasCompressed,
          used_fallback: true, primary_model: modelId, primary_error: primaryErr.message,
        };
      } catch (fallbackErr: any) {
        console.error(`[Gateway] LLM fallback also failed (${fallbackModelId}):`, fallbackErr.message);
        return { response: "Desculpe, não consegui processar sua mensagem no momento. Tente novamente.", model: fallbackModelId, tokens: { prompt: 0, completion: 0, total: 0 }, error: fallbackErr.message, cost_cents: 0, used_fallback: true, both_failed: true };
      }
    }

    const userMsg = isMissingKey
      ? `Chave de API não encontrada para o provedor "${provider}". Configure nas Configurações > Secrets.`
      : "Desculpe, não consegui processar sua mensagem no momento. Tente novamente.";
    return { response: userMsg, model: modelId, tokens: { prompt: 0, completion: 0, total: 0 }, error: humanError, error_pt: humanError, cost_cents: 0 };
  }
}
