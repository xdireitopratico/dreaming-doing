/**
 * prometheus-react-loop.ts — Generic ReAct engine for Prometheus agents
 * 
 * Implements the Thought → Action → Observation loop with:
 * - JSON-first format with 3-level regex fallback (D2)
 * - Tool routing per agent via filtered ToolDef[] (D3)
 * - Token budget enforcement (D5)
 * - Research cache pass-through (D6)
 * - Step logging to prometheus_build_turns
 */

import { routeLLM, type LLMResponse } from "./llm-router.ts";
import {
  insertTurn,
  persistResearchCache,
  persistTokensUsed,
  type SupabaseAdmin,
} from "./prometheus-db.ts";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export interface ReActConfig {
  systemPrompt: string;
  userMessage: string;
  tools: ToolDef[];
  modelId: string;
  fallbackModelId?: string;
  maxSteps?: number;
  sessionId: string;
  agentKey: string;
  round?: number;
  researchCache?: Record<string, unknown>;
  tokenBudget?: { used: number; limit: number };
  /** Supabase admin client for DB logging */
  sb: SupabaseAdmin;
  /** Tool executor: resolves tool_name + params → result */
  executeTool: (toolName: string, params: Record<string, unknown>) => Promise<unknown>;
  /** Motor Prometheus: userId for /api connector key lookup in llm-router */
  tenantId?: string;
}

export interface ToolCallLog {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  latency_ms: number;
}

export interface ReActResult {
  content: string;
  toolCalls: ToolCallLog[];
  tokensUsed: number;
  stepsUsed: number;
  researchCache: Record<string, unknown>;
  error?: boolean;
}

// ═══════════════════════════════════════════════════════════
// PARSED ACTION
// ═══════════════════════════════════════════════════════════

interface ParsedAction {
  thought: string;
  action: string;
  params: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════
// SYSTEM PROMPT BUILDER
// ═══════════════════════════════════════════════════════════

function buildReActSystemPrompt(basePrompt: string, tools: ToolDef[]): string {
  const toolDescriptions = tools.map(t => {
    const params = Object.entries(t.parameters)
      .map(([k, v]) => `${k}: ${v.type}${v.required === false ? "?" : ""}`)
      .join(", ");
    return `- ${t.name}(${params}): ${t.description}`;
  }).join("\n");

  return `${basePrompt}

## FORMATO DE RESPOSTA (OBRIGATÓRIO — JSON válido)

Para usar uma ferramenta:
{"thought":"por que preciso disso","action":"TOOL_NAME","params":{...}}

Para dar sua resposta final:
{"thought":"conclusão","action":"respond","params":{"content":"sua resposta completa"}}

REGRAS:
1. Responda SEMPRE com UM ÚNICO objeto JSON por vez.
2. Nunca responda em texto livre — sempre JSON.
3. Use exatamente os nomes de action disponíveis abaixo.
4. Cada chamada retorna um resultado. Use-o antes de continuar.

## FERRAMENTAS DISPONÍVEIS
${toolDescriptions}`;
}

// ═══════════════════════════════════════════════════════════
// JSON PARSER WITH FALLBACK (D2)
// ═══════════════════════════════════════════════════════════

function parseReActResponse(raw: string): ParsedAction | null {
  // Level 1: Direct JSON.parse
  try {
    const trimmed = raw.trim();
    // Handle markdown code fences
    const jsonStr = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")
      : trimmed;
    const parsed = JSON.parse(jsonStr);
    if (parsed.action) {
      return { thought: parsed.thought || "", action: parsed.action, params: parsed.params || {} };
    }
  } catch { /* fall through */ }

  // Level 2: Extract JSON object from surrounding text
  try {
    const match = raw.match(/\{[\s\S]*"action"\s*:\s*"[^"]+?"[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.action) {
        return { thought: parsed.thought || "", action: parsed.action, params: parsed.params || {} };
      }
    }
  } catch { /* fall through */ }

  // Level 3: Aggressive regex extraction
  try {
    const actionMatch = raw.match(/"action"\s*:\s*"([^"]+)"/);
    if (actionMatch) {
      const action = actionMatch[1];
      let params: Record<string, unknown> = {};
      
      // Try to extract params object
      const paramsMatch = raw.match(/"params"\s*:\s*(\{[^}]*\})/);
      if (paramsMatch) {
        try { params = JSON.parse(paramsMatch[1]); } catch { /* empty params */ }
      }
      
      // Special case: respond action — extract content from anywhere
      if (action === "respond" && !params.content) {
        const contentMatch = raw.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (contentMatch) {
          params = { content: contentMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n") };
        }
      }
      
      const thoughtMatch = raw.match(/"thought"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      return {
        thought: thoughtMatch ? thoughtMatch[1] : "",
        action,
        params,
      };
    }
  } catch { /* fall through */ }

  return null;
}

// ═══════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════

const MAX_STEPS_CAP = 15;
const DEFAULT_MAX_STEPS = 8;
const TOKENS_PER_STEP_ESTIMATE = 2000;
const STEP_TIMEOUT_MS = 30_000;

export async function runReActLoop(config: ReActConfig): Promise<ReActResult> {
  const {
    systemPrompt,
    userMessage,
    tools,
    modelId,
    sessionId,
    agentKey,
    round = 0,
    sb,
    executeTool,
  } = config;

  const maxSteps = Math.min(config.maxSteps ?? DEFAULT_MAX_STEPS, MAX_STEPS_CAP);
  if (!config.researchCache) config.researchCache = {};
  const researchCache = config.researchCache;
  let tokensUsed = config.tokenBudget?.used ?? 0;
  const tokenLimit = config.tokenBudget?.limit ?? 50_000;
  const toolCalls: ToolCallLog[] = [];

  const makeResult = async (partial: ReActResult): Promise<ReActResult> => {
    await persistTokensUsed(sb, sessionId, partial.tokensUsed);
    await persistResearchCache(sb, sessionId, partial.researchCache);
    return partial;
  };

  // Build system prompt with tool definitions
  const fullSystemPrompt = buildReActSystemPrompt(systemPrompt, tools);
  
  // Conversation history for multi-turn
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: fullSystemPrompt },
    { role: "user", content: userMessage },
  ];

  let consecutiveParseFailures = 0;

  for (let step = 0; step < maxSteps; step++) {
    // D5: Token budget check
    if (tokensUsed + TOKENS_PER_STEP_ESTIMATE > tokenLimit) {
      // Force synthesis — budget exhausted
      const forceMsg: Array<{ role: string; content: string }> = [
        ...messages,
        { role: "user", content: 'ATENÇÃO: Limite de tokens atingido. Responda AGORA com {"action":"respond","params":{"content":"..."}}. Apresente o melhor resultado possível com o que já coletou.' },
      ];
      try {
        const forceResp = await routeLLM({ model_id: modelId, messages: forceMsg, temperature: 0.3, max_tokens: 1024, tenant_id: config.tenantId });
        tokensUsed += (forceResp.tokens_in + forceResp.tokens_out);
        const parsed = parseReActResponse(forceResp.content);
        if (parsed?.action === "respond" && parsed.params.content) {
          return makeResult({ content: String(parsed.params.content), toolCalls, tokensUsed, stepsUsed: step + 1, researchCache });
        }
        // If can't parse respond, return raw
        return makeResult({ content: forceResp.content, toolCalls, tokensUsed, stepsUsed: step + 1, researchCache });
      } catch {
        return makeResult({ content: "Token budget excedido. Resultado parcial.", toolCalls, tokensUsed, stepsUsed: step, researchCache, error: true });
      }
    }

    // LLM call with timeout (step-level)
    let llmResponse: LLMResponse;
    try {
      const llmPromise = routeLLM({
        model_id: modelId,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
        tenant_id: config.tenantId,
      });

      llmResponse = await Promise.race([
        llmPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("step_timeout")), STEP_TIMEOUT_MS)
        ),
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "unknown";
      // Try fallback model if available
      if (config.fallbackModelId) {
        console.warn(`[react-loop] Primary model failed (${msg}), trying fallback: ${config.fallbackModelId}`);
        try {
          llmResponse = await Promise.race([
            routeLLM({ model_id: config.fallbackModelId, messages, temperature: 0.3, max_tokens: 1024, tenant_id: config.tenantId }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("fallback_timeout")), STEP_TIMEOUT_MS)),
          ]);
        } catch (e2: unknown) {
          const msg2 = e2 instanceof Error ? e2.message : "unknown";
          console.error(`[react-loop] Fallback also failed: ${msg2}`);
          return makeResult({ content: `Erro na chamada LLM: ${msg} (fallback: ${msg2})`, toolCalls, tokensUsed, stepsUsed: step, researchCache, error: true });
        }
      } else {
        console.error(`[react-loop] LLM call failed at step ${step}: ${msg}`);
        return makeResult({ content: `Erro na chamada LLM: ${msg}`, toolCalls, tokensUsed, stepsUsed: step, researchCache, error: true });
      }
    }

    tokensUsed += (llmResponse.tokens_in + llmResponse.tokens_out);

    // Parse response
    const parsed = parseReActResponse(llmResponse.content);

    if (!parsed) {
      consecutiveParseFailures++;
      if (consecutiveParseFailures >= 3) {
        // After 3 failures, return raw content as best effort
        return makeResult({
          content: llmResponse.content,
          toolCalls,
          tokensUsed,
          stepsUsed: step + 1,
          researchCache,
          error: true,
        });
      }
      // Retry with simplified instruction
      messages.push({ role: "assistant", content: llmResponse.content });
      messages.push({
        role: "user",
        content: 'Resposta inválida. Responda SOMENTE com JSON: {"thought":"...","action":"respond","params":{"content":"sua resposta"}}',
      });
      continue;
    }

    consecutiveParseFailures = 0;

    // Final response
    if (parsed.action === "respond") {
      const content = String(parsed.params.content || parsed.thought || "");
      return makeResult({ content, toolCalls, tokensUsed, stepsUsed: step + 1, researchCache });
    }

    // Tool execution
    const toolDef = tools.find(t => t.name === parsed.action);
    if (!toolDef) {
      // Unknown tool — tell LLM
      messages.push({ role: "assistant", content: llmResponse.content });
      messages.push({
        role: "user",
        content: `Ferramenta "${parsed.action}" não existe. Ferramentas disponíveis: ${tools.map(t => t.name).join(", ")}`,
      });
      continue;
    }

    // Execute tool
    const toolStart = Date.now();
    let toolResult: unknown;
    try {
      toolResult = await executeTool(parsed.action, parsed.params);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "tool execution failed";
      toolResult = { error: errMsg };
    }
    const toolLatency = Date.now() - toolStart;

    // Log tool call
    const callLog: ToolCallLog = {
      tool: parsed.action,
      input: parsed.params,
      output: toolResult,
      latency_ms: toolLatency,
    };
    toolCalls.push(callLog);

    // Log to DB (non-blocking)
    insertTurn(
      sb,
      sessionId,
      agentKey,
      `🔧 ${parsed.action}(${JSON.stringify(parsed.params).slice(0, 200)})`,
      "tool_call",
      "building",
      round,
      { tool_calls: [callLog] },
    ).catch(err => console.error("[react-loop] Failed to log tool call:", err));

    // Inject result back into conversation
    messages.push({ role: "assistant", content: llmResponse.content });
    
    // Truncate tool output to avoid context explosion
    const resultStr = JSON.stringify(toolResult);
    const truncated = resultStr.length > 4000
      ? resultStr.slice(0, 4000) + "...(truncado)"
      : resultStr;
    messages.push({ role: "user", content: `Resultado de ${parsed.action}: ${truncated}` });
  }

  // Max steps exhausted — return what we have
  return makeResult({
    content: "Número máximo de passos atingido. Resultado parcial baseado nas ferramentas utilizadas.",
    toolCalls,
    tokensUsed,
    stepsUsed: maxSteps,
    researchCache,
    error: true,
  });
}
