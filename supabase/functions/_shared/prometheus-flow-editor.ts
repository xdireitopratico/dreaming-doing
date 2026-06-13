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

const FLOW_EDITOR_SYSTEM = `Você é o Flow Editor do Prometheus. O usuário edita um grafo de agente (React Flow) por linguagem natural.

Regras:
- Preserve IDs de nós existentes quando fizer sentido; crie IDs únicos para nós novos (ex: rag_search_1).
- Tipos válidos: trigger, llm, tool, condition, switch, transformer, loop, rag_search, memory, stt, tts, vision, delay, error_handler, hitl, sub_flow, output_guard.
- Todo fluxo precisa de pelo menos um trigger e caminho até output_guard ou nó terminal.
- Responda SOMENTE com JSON válido no formato abaixo.
- Inclua position {x,y} para nós novos; para existentes pode omitir position (será preservada).
- Edges precisam de source e target válidos.

Formato:
{
  "summary": "string — o que mudou em 1-2 frases",
  "nodes": [{ "id": "...", "type": "...", "position": {"x":0,"y":0}, "data": {"label":"...", "config":{}} }],
  "edges": [{ "id": "edge_0", "source": "...", "target": "..." }],
  "changed_node_ids": ["..."]
}`;

function summarizeGraph(nodes: unknown[], edges: unknown[]): string {
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

function parseFlowPatch(raw: string): {
  summary: string;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  changed_node_ids: string[];
} | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "Fluxo atualizado.",
      nodes: parsed.nodes,
      edges: parsed.edges,
      changed_node_ids: Array.isArray(parsed.changed_node_ids) ? parsed.changed_node_ids : [],
    };
  } catch {
    return null;
  }
}

function normalizeNodes(
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

function normalizeEdges(
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

  const { data: flowData, error: flowError } = await sb
    .from("agent_flows")
    .select("name, flow_definition")
    .eq("id", flowId)
    .single();

  if (flowError || !flowData) {
    throw new Error(`Flow not found: ${flowError?.message || flowId}`);
  }

  const def = (flowData.flow_definition as Record<string, unknown>) || {};
  const nodes = (def.nodes as unknown[]) || [];
  const edges = (def.edges as unknown[]) || [];

  const { data, error } = await sb
    .from("prometheus_build_sessions")
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
    } as Record<string, unknown>)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create modify session: ${error?.message}`);
  }

  const sessionId = data.id as string;

  await insertTurn(
    sb,
    sessionId,
    "architect",
    "Olá! Descreva as mudanças que quer no fluxo — adicionar nós, conectar ferramentas, ajustar prompts. Eu aplico no canvas em tempo real.",
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

  const { data: flowData } = await sb
    .from("agent_flows")
    .select("flow_definition")
    .eq("id", flowId)
    .single();

  const def = (flowData?.flow_definition as Record<string, unknown>) || {};
  const nodes = (def.nodes as Array<Record<string, unknown>>) || [];
  const edges = (def.edges as Array<Record<string, unknown>>) || [];

  const userPrompt = `Grafo atual:\n${summarizeGraph(nodes, edges)}\n\nJSON completo (referência):\n${JSON.stringify({ nodes, edges })}\n\nPedido do usuário:\n${message}`;

  const llmResult = await routeLLM({
    model_id: modelId,
    messages: [
      { role: "system", content: FLOW_EDITOR_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 4096,
    tenant_id: session.user_id as string,
    feature: "prometheus_flow_editor",
  });

  if (llmResult.tokens_in + llmResult.tokens_out > 0) {
    await persistTokensUsed(sb, sessionId, llmResult.tokens_in + llmResult.tokens_out);
  }

  const patch = parseFlowPatch(llmResult.content);
  if (!patch) {
    await insertTurn(
      sb,
      sessionId,
      "architect",
      "Não consegui interpretar a resposta como patch de fluxo. Tente ser mais específico (ex: \"adicione um nó RAG entre o LLM e o output guard\").",
      "architecture",
      "building",
      round,
    );
    return;
  }

  const normalizedNodes = normalizeNodes(patch.nodes, nodes);
  const normalizedEdges = normalizeEdges(patch.edges);

  const flowPatch = {
    nodes: normalizedNodes,
    edges: normalizedEdges,
    changed_node_ids: patch.changed_node_ids,
  };

  const updatedDef = {
    ...def,
    nodes: normalizedNodes,
    edges: normalizedEdges,
  };

  await sb.from("agent_flows").update({
    flow_definition: updatedDef,
    updated_at: new Date().toISOString(),
  }).eq("id", flowId);

  await sb.from("prometheus_build_sessions").update({
    flow_definition: updatedDef,
  }).eq("id", sessionId);

  await insertTurn(
    sb,
    sessionId,
    "architect",
    patch.summary,
    "architecture",
    "building",
    round,
    { flow_patch: flowPatch },
  );
}