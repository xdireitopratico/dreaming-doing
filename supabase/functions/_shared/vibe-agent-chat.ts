/**
 * vibe-agent-chat.ts — Chat do Vibe Agent (isolado do boardroom Prometheus)
 *
 * Model resolution follows the same path as VibeCoder (agent-run):
 * loads user's connectors from the API tab, picks the best model
 * from the catalog the user has a key for.
 * No hardcoded fallbacks, no tenant_secrets for key resolution.
 */

import { routeLLM } from "./llm-router.ts";
import { supabaseAdmin, type SupabaseAdmin } from "./prometheus-db.ts";
import { loadConnectorKeys } from "../agent-run/connector-keys.ts";
import { ALL_MODELS } from "./model-catalog.ts";
import {
  normalizeEdges,
  normalizeNodes,
  parseFlowAgentResponse,
  summarizeGraph,
  VIBE_AGENT_SYSTEM,
} from "./prometheus-flow-editor.ts";

const WELCOME_MESSAGE =
  "Olá! Sou a Secretária do Prometheus — seu Vibe Agent aqui no canvas. Pode pedir mudanças no fluxo, tirar dúvidas ou pedir para eu terminar o agente. O que precisa?";

export async function createVibeConversation(
  userId: string,
  flowId: string,
): Promise<{ conversation_id: string; title: string }> {
  const sb = supabaseAdmin();

  const { data: flow } = await sb
    .from("agent_flows")
    .select("name")
    .eq("id", flowId)
    .eq("user_id", userId)
    .single();

  if (!flow) throw new Error("Flow not found");

  const now = new Date();
  const title = `Conversa ${now.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  const { data: conv, error } = await sb
    .from("vibe_agent_conversations")
    .insert({
      flow_id: flowId,
      user_id: userId,
      title,
    })
    .select("id, title")
    .single();

  if (error || !conv) throw new Error(`Failed to create conversation: ${error?.message}`);

  await sb.from("vibe_agent_messages").insert({
    conversation_id: conv.id,
    role: "assistant",
    content: WELCOME_MESSAGE,
    meta: { kind: "welcome" },
  });

  return { conversation_id: conv.id as string, title: conv.title as string };
}

export async function listVibeConversations(userId: string, flowId: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("vibe_agent_conversations")
    .select("id, title, created_at, updated_at")
    .eq("flow_id", flowId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadVibeMessages(conversationId: string, userId: string) {
  const sb = supabaseAdmin();
  const { data: conv } = await sb
    .from("vibe_agent_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (!conv) throw new Error("Conversation not found");

  const { data, error } = await sb
    .from("vibe_agent_messages")
    .select("id, role, content, meta, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Maps connector key names (from loadConnectorKeys) to model-catalog provider IDs.
 * loadConnectorKeys stores Gemini as GEMINI_API_KEY; catalog uses provider "google".
 */
const KEY_TO_CATALOG_PROVIDER: Record<string, string> = {
  GROQ_API_KEY: "groq",
  OPENAI_API_KEY: "openai",
  ANTHROPIC_API_KEY: "anthropic",
  XAI_API_KEY: "xai",
  GEMINI_API_KEY: "google",
  OPENROUTER_API_KEY: "openrouter",
  NVIDIA_API_KEY: "nvidia",
};

/** Provider priority for auto-selection (lower index = preferred). */
const PROVIDER_PRIORITY = ["groq", "openai", "anthropic", "xai", "google", "openrouter", "nvidia"];

const QUALITY_RANK: Record<string, number> = { "very-high": 0, "high": 1, "medium": 2, "low": 3 };

/**
 * Resolve the best LLM model from the user's configured connectors.
 * Same resolution path as VibeCoder — reads the API tab connectors,
 * picks the highest-quality model the user has a key for.
 */
async function resolveVibeAgentModel(sb: SupabaseAdmin, userId: string): Promise<string> {
  const keys = await loadConnectorKeys(sb, userId);

  const availableProviders = new Set<string>();
  for (const keyName of Object.keys(keys)) {
    const provider = KEY_TO_CATALOG_PROVIDER[keyName];
    if (provider) availableProviders.add(provider);
  }

  if (availableProviders.size === 0) {
    throw new Error(
      "Nenhuma chave LLM configurada. Adicione uma chave em Configurações > API para usar o Vibe Agent.",
    );
  }

  for (const provider of PROVIDER_PRIORITY) {
    if (!availableProviders.has(provider)) continue;

    const candidate = ALL_MODELS
      .filter((m) => m.provider === provider && m.chatAllowed && !m.deprecated)
      .sort((a, b) => (QUALITY_RANK[a.quality ?? "medium"] ?? 2) - (QUALITY_RANK[b.quality ?? "medium"] ?? 2))
      .shift();

    if (candidate) return candidate.id;
  }

  throw new Error("Nenhum modelo disponível para as chaves configuradas.");
}

export async function sendVibeAgentMessage(
  userId: string,
  conversationId: string,
  message: string,
): Promise<{
  user_message_id: string;
  assistant_message_id: string;
  assistant_content: string;
  flow_patch?: { nodes: unknown[]; edges: unknown[]; changed_node_ids?: string[] };
}> {
  const sb = supabaseAdmin();
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Message required");

  const { data: conv, error: convErr } = await sb
    .from("vibe_agent_conversations")
    .select("id, flow_id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (convErr || !conv) throw new Error("Conversation not found");

  const flowId = conv.flow_id as string;

  const { data: userRow, error: userErr } = await sb
    .from("vibe_agent_messages")
    .insert({ conversation_id: conversationId, role: "user", content: trimmed, meta: {} })
    .select("id")
    .single();

  if (userErr || !userRow) throw new Error(`Failed to save user message: ${userErr?.message}`);

  const { data: history } = await sb
    .from("vibe_agent_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  const { data: flowData } = await sb
    .from("agent_flows")
    .select("flow_definition")
    .eq("id", flowId)
    .single();

  const def = (flowData?.flow_definition as Record<string, unknown>) || {};
  const nodes = (def.nodes as Array<Record<string, unknown>>) || [];
  const edges = (def.edges as Array<Record<string, unknown>>) || [];
  const modelId = await resolveVibeAgentModel(sb, userId);

  const chatHistory = (history ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "Cliente" : "Secretária"}: ${m.content}`)
    .join("\n");

  const userPrompt = [
    `Histórico desta conversa (somente este chat — ignore boardroom ou outras sessões):`,
    chatHistory,
    `\nGrafo atual no canvas:\n${summarizeGraph(nodes, edges)}`,
    `JSON do grafo:\n${JSON.stringify({ nodes, edges })}`,
    `\nNova mensagem do cliente:\n${trimmed}`,
  ].join("\n");

  const llmResult = await routeLLM({
    model_id: modelId,
    messages: [
      { role: "system", content: VIBE_AGENT_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 4096,
    tenant_id: userId,
    feature: "vibe_agent_chat",
  });

  const response = parseFlowAgentResponse(llmResult.content);
  const assistantContent = response?.summary
    ?? "Não consegui processar. Reformule sua pergunta ou peça uma mudança específica no fluxo.";

  let flowPatch: { nodes: unknown[]; edges: unknown[]; changed_node_ids?: string[] } | undefined;
  const meta: Record<string, unknown> = {
    answer_only: response?.answer_only ?? !response,
  };

  if (response && !response.answer_only) {
    const normalizedNodes = normalizeNodes(response.nodes, nodes);
    const normalizedEdges = normalizeEdges(response.edges);
    flowPatch = {
      nodes: normalizedNodes,
      edges: normalizedEdges,
      changed_node_ids: response.changed_node_ids,
    };
    meta.flow_patch = flowPatch;

    const updatedDef = { ...def, nodes: normalizedNodes, edges: normalizedEdges };
    await sb.from("agent_flows").update({
      flow_definition: updatedDef,
      updated_at: new Date().toISOString(),
    }).eq("id", flowId);
  }

  const { data: assistantRow, error: asstErr } = await sb
    .from("vibe_agent_messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content: assistantContent,
      meta,
    })
    .select("id")
    .single();

  if (asstErr || !assistantRow) throw new Error(`Failed to save assistant message: ${asstErr?.message}`);

  await sb.from("vibe_agent_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return {
    user_message_id: userRow.id as string,
    assistant_message_id: assistantRow.id as string,
    assistant_content: assistantContent,
    flow_patch: flowPatch,
  };
}