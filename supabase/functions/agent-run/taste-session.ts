import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createLLMProvider } from "./adapters/llm.ts";
import type { ChatMessage, ChatResponse } from "./types.ts";
import { buildChatHistory } from "./memory.ts";
import { loadForgeTrialRobinPool } from "./connector-keys.ts";
import { defaultRobinModel, PLATFORM_ROBIN_TASTE_PRESET_ID } from "../_shared/model-presets.ts";
import { TASTE_CONCIERGE_SYSTEM } from "./prompts-taste.ts";
import { buildProvider, type ProviderConfig } from "./providers.ts";
import { ToolRegistry } from "./registry.ts";
import { registerTasteTools, type TasteUiEmit } from "./tools/taste.ts";

export async function loadTasteNvidiaConfig(
  supabase: SupabaseClient,
  platformNvidiaSecret?: string,
): Promise<ProviderConfig> {
  const poolKeys = await loadForgeTrialRobinPool(supabase, platformNvidiaSecret);
  if (poolKeys.length === 0) {
    throw new Error(
      "Taste: configure o pool NVIDIA do administrador em API Keys ou NVIDIA_API_KEY em secrets da plataforma.",
    );
  }
  const wire = defaultRobinModel("nvidia", PLATFORM_ROBIN_TASTE_PRESET_ID);
  return {
    provider: wire.provider,
    apiKey: poolKeys[0]!,
    model: wire.model,
    baseUrl: wire.baseUrl,
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
}): Promise<{ ok: boolean; content: string }> {
  const { supabase, userId, conversationId, cfg, emit, sessionAddon } = params;

  const { data: history } = await supabase
    .from("messages")
    .select("role, parts, tool_calls, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  const messages = buildChatHistory(history ?? []);
  const llm = createLLMProvider({
    provider: cfg.provider,
    apiKey: cfg.apiKey,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
  });

  const reg = new ToolRegistry();
  registerTasteTools(reg, { supabase, userId, emit });

  emit("phase", { phase: "taste_chat", message: "Concierge FORGE (NVIDIA Taste)…" });
  emit("start", {
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

  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...messages,
  ];

  const content = await runTasteToolLoop(llm, reg, chatMessages);

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    parts: [{ type: "text", text: content }],
  });

  emit("phase", { phase: "done", message: "Resposta Taste enviada." });
  return { ok: true, content };
}

export function tasteProviderResilient(cfg: ProviderConfig) {
  return buildProvider(cfg);
}