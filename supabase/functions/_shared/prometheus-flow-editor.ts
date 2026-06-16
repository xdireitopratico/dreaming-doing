/**
 * prometheus-flow-editor.ts — Incremental flow edits via natural language (intent: modify)
 * Lightweight path: no boardroom / sentinel / deploy pipeline.
 */

import { routeLLM } from "./llm-router.ts";
import {
  insertTurn,
  persistTokensUsed,
  supabaseAdmin,
  type SupabaseAdmin,
} from "./prometheus-db.ts";

export const VIBE_AGENT_SYSTEM = `Você é a Secretária do Prometheus — o Vibe Agent no canvas React Flow.

Contexto: esta é a conversa privada do cliente neste chat. Não é boardroom, não é proposta, não é outra sessão. Use apenas o histórico desta conversa e o grafo atual do canvas. Tom direto e amigável (como vibe coding de sites, mas para agentes).

Capacidades:
1) Responder dúvidas sobre arquitetura, nós, tools, prompts e boas práticas — SEM alterar o grafo.
2) Aplicar mudanças no grafo quando o usuário pedir explicitamente (adicionar/remover nós, conectar, ajustar configs).

Regras técnicas (quando alterar o grafo):
- Preserve IDs de nós existentes quando fizer sentido; crie IDs únicos para nós novos.
- Tipos válidos: trigger, llm, tool, condition, switch, transformer, loop, rag_search, memory, stt, tts, vision, delay, error_handler, hitl, sub_flow, output_guard.
- Todo fluxo precisa de pelo menos um trigger e caminho até output_guard ou nó terminal.
- Inclua position {x,y} para nós novos; para existentes pode omitir position.
- Responda SOMENTE com JSON válido.

Se for APENAS dúvida/explicação (sem mudança no canvas):
{
  "answer_only": true,
  "summary": "sua resposta em português, clara e objetiva"
}

Se for mudança no grafo:
{
  "answer_only": false,
  "summary": "o que mudou em 1-2 frases",
  "nodes": [{ "id": "...", "type": "...", "position": {"x":0,"y":0}, "data": {"label":"...", "config":{}} }],
  "edges": [{ "id": "edge_0", "source": "...", "target": "..." }],
  "changed_node_ids": ["..."]
}`;

export function summarizeGraph(nodes: unknown[], edges: unknown[]): string {
  const nodeLines = (nodes as Array<Record<string, unknown>>).map((n) => {
    const data = n.data as Record<string, unknown> | undefined;
    const label = data?.label ?? n.id;
    return `- ${n.id} (${n.type}): ${label}`;
  });
  const edgeLines = (edges as Array<Record<string, unknown>>).map(
    (e) => `- ${e.source} → ${e.target}`,
  );
  return `Nós:\n${nodeLines.join("\n") || "(vazio)"}\n\nArestas:\n${edgeLines.join("\n") || "(vazio)"}`;
}

type FlowAgentResponse =
  | { answer_only: true; summary: string }
  | {
    answer_only: false;
    summary: string;
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
    changed_node_ids: string[];
  };

export function parseFlowAgentResponse(raw: string): FlowAgentResponse | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const summary = typeof parsed.summary === "string" ? parsed.summary : null;
    if (!summary) return null;

    if (parsed.answer_only === true) {
      return { answer_only: true, summary };
    }

    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return {
      answer_only: false,
      summary,
      nodes: parsed.nodes,
      edges: parsed.edges,
      changed_node_ids: Array.isArray(parsed.changed_node_ids) ? parsed.changed_node_ids : [],
    };
  } catch {
    return null;
  }
}

export function normalizeNodes(
  rawNodes: Array<Record<string, unknown>>,
  existingNodes: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const posById = new Map<string, { x: number; y: number }>();
  for (const n of existingNodes) {
    const pos = n.position as { x?: number; y?: number } | undefined;
    if (typeof n.id === "string" && pos) {
      posById.set(n.id, { x: pos.x ?? 0, y: pos.y ?? 0 });
    }
  }

  let nextY = 100;
  return rawNodes.map((n, i) => {
    const id = (n.id as string) || `node_${i}`;
    const existing = posById.get(id);
    const pos = n.position as { x?: number; y?: number } | undefined;
    const position = existing ?? {
      x: pos?.x ?? 250 + (i % 3) * 180,
      y: pos?.y ?? nextY + i * 120,
    };
    const data = (n.data as Record<string, unknown>) || {};
    return {
      id,
      type: n.type || "llm",
      position,
      data: {
        label: data.label ?? id,
        config: data.config ?? {},
      },
    };
  });
}

export function normalizeEdges(
  rawEdges: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return rawEdges.map((e, i) => ({
    id: (e.id as string) || `edge_${i}`,
    source: e.source,
    target: e.target,
    type: "conditional",
    animated: true,
    data: { label: "", condition: "", edge_type: "default", priority: 0 },
    style: { stroke: "hsl(var(--primary))" },
  }));
}

export async function startModifySession(
  userId: string,
  flowId: string,
  modelId: string,
): Promise<{ session_id: string }> {
  const sb = supabaseAdmin();

  const { data: flowData, error: flowError } = await (sb.from("agent_flows" as any) as any)
    .select("name, flow_definition")
    .eq("id", flowId)
    .single();

  if (flowError || !flowData) {
    throw new Error(`Flow not found: ${flowError?.message || flowId}`);
  }

  const def = (flowData.flow_definition as Record<string, unknown>) || {};
  const nodes = (def.nodes as unknown[]) || [];
  const edges = (def.edges as unknown[]) || [];

  const { data, error } = await (sb.from("prometheus_build_sessions" as any) as any)
    .insert({
      user_id: userId,
      intent: "modify",
      phase: "building",
      messages: [],
      requirements: {
        flow_name: flowData.name,
        node_count: nodes.length,
        edge_count: edges.length,
      },
      target_flow_id: flowId,
      quality_model: modelId,
      flow_definition: def,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create modify session: ${error?.message}`);
  }

  const sessionId = data.id as string;

  await insertTurn(
    sb,
    sessionId,
    "secretary",
    "Olá! Sou a Secretária do Prometheus — seu Vibe Agent aqui no canvas. Pode pedir mudanças no fluxo, tirar dúvidas ou pedir para eu terminar o agente. O que precisa?",
    "architecture",
    "building",
    1,
  );

  return { session_id: sessionId };
}

export async function processFlowEditMessage(
  sb: SupabaseAdmin,
  sessionId: string,
  session: Record<string, unknown>,
  message: string,
  round: number,
): Promise<void> {
  const flowId = session.target_flow_id as string;
  const modelId = (session.quality_model as string) || "";
  if (!modelId) throw new Error("[flow-editor] quality_model is required");
  if (!flowId) throw new Error("[flow-editor] target_flow_id is required");

  const { data: flowData } = await (sb.from("agent_flows" as any) as any)
    .select("flow_definition")
    .eq("id", flowId)
    .single();

  const def = (flowData?.flow_definition as Record<string, unknown>) || {};
  const nodes = (def.nodes as Array<Record<string, unknown>>) || [];
  const edges = (def.edges as Array<Record<string, unknown>>) || [];
  const briefing = (def.briefing as Record<string, unknown>) || {};
  const boardroom = (def.boardroom_output as Record<string, unknown>) || {};

  const prometheusContext = [
    briefing.prompt ? `Prompt original (Prometheus): ${briefing.prompt}` : null,
    briefing.objective ? `Objetivo: ${briefing.objective}` : null,
    boardroom.genome ? `Genoma: ${boardroom.genome}` : null,
    boardroom.objective ? `Objetivo boardroom: ${boardroom.objective}` : null,
  ].filter(Boolean).join("\n");

  const userPrompt = [
    prometheusContext ? `Contexto do agente (criado via Prometheus):\n${prometheusContext}` : null,
    `Grafo atual:\n${summarizeGraph(nodes, edges)}`,
    `JSON completo (referência):\n${JSON.stringify({ nodes, edges })}`,
    `Pedido do usuário:\n${message}`,
  ].filter(Boolean).join("\n\n");

  const llmResult = await routeLLM({
    model_id: modelId,
    messages: [
      { role: "system", content: VIBE_AGENT_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 4096,
    tenant_id: session.user_id as string,
    feature: "prometheus_vibe_agent",
  });

  if (llmResult.tokens_in + llmResult.tokens_out > 0) {
    await persistTokensUsed(sb, sessionId, llmResult.tokens_in + llmResult.tokens_out);
  }

  const response = parseFlowAgentResponse(llmResult.content);
  if (!response) {
    await insertTurn(
      sb,
      sessionId,
      "secretary",
      "Não consegui processar isso. Reformule: peça uma mudança no fluxo ou faça uma pergunta direta sobre o agente.",
      "architecture",
      "building",
      round,
    );
    return;
  }

  if (response.answer_only) {
    await insertTurn(
      sb,
      sessionId,
      "secretary",
      response.summary,
      "architecture",
      "building",
      round,
      { answer_only: true },
    );
    return;
  }

  const normalizedNodes = normalizeNodes(response.nodes, nodes);
  const normalizedEdges = normalizeEdges(response.edges);

  const flowPatch = {
    nodes: normalizedNodes,
    edges: normalizedEdges,
    changed_node_ids: response.changed_node_ids,
  };

  const updatedDef = {
    ...def,
    nodes: normalizedNodes,
    edges: normalizedEdges,
  };

  await (sb.from("agent_flows" as any) as any).update({
    flow_definition: updatedDef,
    updated_at: new Date().toISOString(),
  }).eq("id", flowId);

  await (sb.from("prometheus_build_sessions" as any) as any).update({
    flow_definition: updatedDef,
  }).eq("id", sessionId);

  await insertTurn(
    sb,
    sessionId,
    "secretary",
    response.summary,
    "architecture",
    "building",
    round,
    { flow_patch: flowPatch },
  );
}