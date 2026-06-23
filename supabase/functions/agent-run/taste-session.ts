import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createLLMProvider } from "./adapters/llm.ts";
import type { ChatMessage, ChatResponse } from "./types.ts";
import { buildChatHistory } from "./memory.ts";
import { loadForgeTrialRobinPool } from "./connector-keys.ts";
import { defaultRobinModel, PLATFORM_ROBIN_TASTE_PRESET_ID } from "../_shared/model-presets.ts";
import { TASTE_CONCIERGE_SYSTEM } from "./prompts-taste.ts";
import { buildProvider, type ProviderConfig } from "./providers.ts";
import { normalizeNimBaseUrl, normalizeNvidiaApiModel } from "../_shared/nvidia-model.ts";
import { ToolRegistry } from "./registry.ts";
import { registerTasteTools, type TasteUiEmit } from "./tools/taste.ts";

export async function loadTasteNvidiaConfig(supabase: SupabaseClient): Promise<ProviderConfig> {
  const poolKeys = await loadForgeTrialRobinPool(supabase);
  if (poolKeys.length === 0) {
    throw new Error("Taste: o administrador precisa cadastrar o pool NVIDIA em API Keys (/api).");
  }
  const wire = defaultRobinModel("nvidia", PLATFORM_ROBIN_TASTE_PRESET_ID);
  return {
    provider: wire.provider,
    apiKey: poolKeys[0]!,
    model: normalizeNvidiaApiModel(wire.model),
    baseUrl: normalizeNimBaseUrl(wire.baseUrl) ?? wire.baseUrl,
    label: `Taste · ${wire.label}`,
  };
}

const MAX_TASTE_TOOL_ROUNDS = 5;

async function runTasteToolLoop(
  llm: ReturnType<typeof createLLMProvider>,
  reg: ToolRegistry,
  baseMessages: ChatMessage[],
): Promise<string> {
  const messages: ChatMessage[] = [...baseMessages];

  for (let round = 0; round < MAX_TASTE_TOOL_ROUNDS; round++) {
    const resp: ChatResponse = await llm.chat({
      messages,
      tools: reg.getDefinitions(),
      tool_choice: "auto",
      max_tokens: 2048,
      temperature: 0.4,
    });

    if (!resp.tool_calls?.length) {
      return resp.content?.trim() || "Como posso ajudar você a configurar o FORGE?";
    }

    messages.push({
      role: "assistant",
      content: resp.content ?? "",
      tool_calls: resp.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    for (const call of resp.tool_calls) {
      const result = await reg.execute(call);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({
          ok: result.ok,
          output: result.output,
          error: result.error,
        }).slice(0, 4000),
      });
    }
  }

  return "Use os links do editor ou peça para abrir Vercel, API Keys ou GitHub — estou aqui para orientar.";
}

export async function runTasteChat(params: {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string;
  cfg: ProviderConfig;
  emit: TasteUiEmit;
  sessionAddon?: string;
  enabledSkillIds?: string[];
  enabledMcpIds?: string[];
  activeSkills?: string[];
  activeMcps?: string[];
}): Promise<{ ok: boolean; content: string; uiActions?: Array<Record<string, unknown>> }> {
  const { supabase, userId, conversationId, cfg, emit, sessionAddon } = params;

  // Session 2.0 — coleta ui_action events para retornar no JSON (taste é HTTP,
  // não stream). O frontend despacha via dispatchTasteUiAction ao receber.
  const uiActions: Array<Record<string, unknown>> = [];
  const wrappedEmit: TasteUiEmit = (type: string, data: Record<string, unknown>) => {
    if (type === "ui_action" && data && typeof data === "object") {
      uiActions.push({ ...data });
    }
    emit(type, data);
  };

  const { data: history } = await supabase
    .from("messages")
    .select("role, parts, tool_calls, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  const messages = await buildChatHistory(history ?? [], 40, cfg.model);
  const llm = createLLMProvider({
    provider: cfg.provider,
    apiKey: cfg.apiKey,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
  });

  const reg = new ToolRegistry();
  registerTasteTools(reg, { supabase, userId, emit: wrappedEmit });

  wrappedEmit("phase", { phase: "taste_chat", message: "Concierge FORGE (NVIDIA Taste)…" });
  wrappedEmit("start", {
    provider: cfg.label,
    taste: true,
    sessionKind: "taste_chat",
    enabledSkillIds: params.enabledSkillIds ?? [],
    enabledMcpIds: params.enabledMcpIds ?? [],
    activeSkills: params.activeSkills ?? [],
    activeMcps: params.activeMcps ?? [],
  });

  const systemContent = sessionAddon?.trim()
    ? `${TASTE_CONCIERGE_SYSTEM}\n\n${sessionAddon}`
    : TASTE_CONCIERGE_SYSTEM;

  const chatMessages: ChatMessage[] = [{ role: "system", content: systemContent }, ...messages];

  const content = await runTasteToolLoop(llm, reg, chatMessages);

  if (content?.trim()) {
    wrappedEmit("assistant_text", { text: content.trim(), final: true });
  }

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    parts: [{ type: "text", text: content }],
  });

  wrappedEmit("phase", { phase: "done", message: "Resposta Taste enviada." });
  return {
    ok: true,
    content,
    ...(uiActions.length > 0 ? { uiActions } : {}),
  };
}

export function tasteProviderResilient(cfg: ProviderConfig) {
  return buildProvider(cfg);
}
