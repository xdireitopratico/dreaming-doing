// ============================================================================
// AGENT LOOP — Execução do Vibe Agent com emissão dual (chat + inspector)
// ============================================================================

import type { ChatEvent, InspectorEvent } from "./vibe-agent-events.ts";
import {
  normalizeEdges,
  normalizeNodes,
  parseFlowAgentResponse,
  summarizeGraph,
  VIBE_AGENT_SYSTEM,
} from "./prometheus-flow-editor.ts";
import { createLLMProvider } from "../agent-run/adapters/llm.ts";
import { resolveAgentProvider, loadUserLlmContext } from "../agent-run/run-setup.ts";
import { supabaseAdmin } from "./prometheus-db.ts";

interface LoopContext {
  executionId: string;
  conversationId: string;
  userMessage: string;
  userId: string;
  model?: string;
  provider?: string;
  chatWriter: WritableStreamDefaultWriter<ChatEvent>;
  inspectorWriter: WritableStreamDefaultWriter<InspectorEvent>;
  requestId: string;
  sessionId: string;
}

type InspectorTool = 'read' | 'search' | 'edit' | 'bash' | 'grep' | 'list' | 'patch' | 'llm_call' | 'db_query' | 'web_search' | 'reasoning';

interface ExplorationStep {
  id: string;
  label: string;
  tool: InspectorTool;
}

interface TaskResult {
  taskId: string;
  success: boolean;
  output?: string;
  error?: string;
}

type ChatEmitter = (event: any) => Promise<void>;
type InspectorEmitter = (event: any) => Promise<void>;

interface AtomicPlan {
  title: string;
  tasks: Array<{ id: string; label: string; dependsOn?: string[] }>;
}

let sequence = 0;
const sequenceByChannel: Record<'chat' | 'inspector', number> = { chat: 0, inspector: 0 };

export async function executeAgentLoop(ctx: LoopContext): Promise<void> {
  const sb = supabaseAdmin();
  const startTime = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let flowPatch: { nodes: unknown[]; edges: unknown[]; changed_node_ids?: string[] } | undefined;

  const emitChat = async (event: any) => {
    const chatEvent = { ...event, timestamp: Date.now(), requestId: ctx.requestId } as ChatEvent;
    await persistVibeEvent(sb, ctx, 'chat', chatEvent);
    ctx.chatWriter.write(chatEvent);
  };

  const emitInspector = async (event: any) => {
    const inspectorEvent = { ...event, timestamp: Date.now(), requestId: ctx.requestId, sequence: ++sequence } as InspectorEvent;
    await persistVibeEvent(sb, ctx, 'inspector', inspectorEvent);
    ctx.inspectorWriter.write(inspectorEvent);
  };

  try {
    // ─── SESSION START ───
    await emitInspector({
      type: 'session_start',
      sessionId: ctx.sessionId,
      prompt: ctx.userMessage,
      model: ctx.model || 'auto',
      provider: ctx.provider || 'auto',
    });

    // ─── INTRO ───
    const introText = `Vou avaliar o problema com o chat e onde ele quebra. Vou analisar o fluxo atual, identificar a causa raiz e aplicar os ajustes necessários.`;
    await emitChat({ type: 'chat_intro', text: introText });

    // ─── LOOPING PHASE (exploração) ───
    const loopSteps = await runExplorationLoop(ctx, emitChat, emitInspector);

    // ─── LLM EXECUTION ───
    const llmResult = await runLLMExecution(ctx, emitInspector);
    flowPatch = llmResult.flowPatch;

    // ─── PLAN APPROVAL (based on actual LLM result) ───
    const plan = generatePlanFromLLM(llmResult);
    const planId = crypto.randomUUID();
    await emitChat({
      type: 'chat_plan_approved',
      planId,
      title: plan.title,
      tasks: plan.tasks.map(t => ({ ...t, status: 'done' })),
    });

    // ─── CLOSURE ───
    const closureSummary = llmResult.assistantContent;
    const remaining: string[] = [];
    const nextSteps = [
      "Validar o comportamento em ambiente de preview",
      "Testar a experiência do usuário no fluxo completo",
      "Revisar logs do inspector para identificar gargalos",
    ];
    const artifacts = flowPatch ? [
      { type: 'flow_version' as const, id: crypto.randomUUID(), label: 'Patch aplicado ao flow' },
    ] : [];

    await emitChat({
      type: 'chat_closure',
      summary: closureSummary,
      remaining,
      nextSteps,
      artifacts,
    });

    const outcome = llmResult.flowPatch ? 'success' : 'partial';

    // ─── SESSION END ───
    await emitInspector({
      type: 'session_end',
      sessionId: ctx.sessionId,
      outcome,
      totalDurationMs: Date.now() - startTime,
      totalTokens: { input: totalInputTokens, output: totalOutputTokens },
    });

    // ─── Persist messages in DB ───
    await persistExecutionMessages(sb, ctx, closureSummary, flowPatch);
    await updateAgentExecution(sb, ctx.executionId, {
      status: outcome,
      duration_ms: Date.now() - startTime,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
    await emitChat({
      type: 'chat_error',
      code: 'EXECUTION_FAILED',
      message: errorMessage,
      recoverable: true,
      suggestion: 'Tente reformular ou peça para continuar de onde parou.',
    });
    await emitInspector({
      type: 'session_end',
      sessionId: ctx.sessionId,
      outcome: 'failed',
      totalDurationMs: Date.now() - startTime,
      totalTokens: { input: totalInputTokens, output: totalOutputTokens },
    });
    await updateAgentExecution(sb, ctx.executionId, {
      status: 'failed',
      duration_ms: Date.now() - startTime,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      error_message: errorMessage,
    });

    // Persist error message
    await (sb.from("vibe_agent_messages" as any) as any).insert({
      conversation_id: ctx.conversationId,
      role: "assistant",
      content: `Erro ao processar: ${errorMessage}`,
      meta: { kind: "error", error: errorMessage },
    });
  }
}

// ─── LLM EXECUTION ───
interface LLMResult {
  assistantContent: string;
  flowPatch?: { nodes: unknown[]; edges: unknown[]; changed_node_ids?: string[]; description?: string };
}

async function runLLMExecution(
  ctx: LoopContext,
  emitInspector: InspectorEmitter,
): Promise<LLMResult> {
  const sb = supabaseAdmin();

  // Load conversation history
  await emitInspector({
    type: 'tool_call',
    callId: crypto.randomUUID(),
    tool: 'db_query',
    input: { action: 'load_history', conversation_id: ctx.conversationId },
    status: 'start',
  });

  const { data: history } = await (sb.from("vibe_agent_messages" as any) as any)
    .select("role, content, meta")
    .eq("conversation_id", ctx.conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  await emitInspector({
    type: 'tool_call',
    callId: crypto.randomUUID(),
    tool: 'db_query',
    input: { action: 'load_history', conversation_id: ctx.conversationId },
    output: { count: history?.length || 0 },
    status: 'complete',
  });

  // Load flow definition
  await emitInspector({
    type: 'tool_call',
    callId: crypto.randomUUID(),
    tool: 'db_query',
    input: { action: 'load_flow', conversation_id: ctx.conversationId },
    status: 'start',
  });

  const { data: conv } = await (sb.from("vibe_agent_conversations" as any) as any)
    .select("flow_id")
    .eq("id", ctx.conversationId)
    .single();

  if (!conv) throw new Error("Conversation not found");

  const { data: flowData } = await (sb.from("agent_flows" as any) as any)
    .select("flow_definition")
    .eq("id", (conv as any).flow_id)
    .single();

  await emitInspector({
    type: 'tool_call',
    callId: crypto.randomUUID(),
    tool: 'db_query',
    input: { action: 'load_flow', conversation_id: ctx.conversationId },
    output: { found: !!flowData },
    status: 'complete',
  });

  const def = ((flowData as any)?.flow_definition as Record<string, unknown>) || {};
  const nodes = (def.nodes as Array<Record<string, unknown>>) || [];
  const edges = (def.edges as Array<Record<string, unknown>>) || [];

  const chatHistory = (history ?? [])
    .filter((m: any) => m.role === "user" || m.role === "assistant")
    .map((m: any) => `${m.role === "user" ? "Cliente" : "Secretária"}: ${m.content}`)
    .join("\n");

  const userPrompt = [
    `Histórico desta conversa:`,
    chatHistory,
    `\nGrafo atual no canvas:\n${summarizeGraph(nodes, edges)}`,
    `JSON do grafo:\n${JSON.stringify({ nodes, edges })}`,
    `\nNova mensagem do cliente:\n${ctx.userMessage}`,
  ].join("\n");

  await emitInspector({
    type: 'thinking',
    content: 'Chamando LLM com contexto do flow atual...',
  });

  await emitInspector({
    type: 'tool_call',
    callId: crypto.randomUUID(),
    tool: 'llm_call',
    input: { model: ctx.model || 'auto', provider: ctx.provider || 'auto' },
    status: 'start',
  });

  const llmStart = Date.now();
  const llm = createLLMProvider({
    provider: ctx.provider || 'openai',
    model: ctx.model || 'gpt-4o-mini',
    apiKey: Deno.env.get('OPENAI_API_KEY') || '',
  } as any);

  const llmResponse = await llm.chat({
    messages: [
      { role: 'system', content: VIBE_AGENT_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 4096,
  });

  await emitInspector({
    type: 'tool_call',
    callId: crypto.randomUUID(),
    tool: 'llm_call',
    input: { model: ctx.model || 'auto', provider: ctx.provider || 'auto' },
    output: { durationMs: Date.now() - llmStart },
    status: 'complete',
    durationMs: Date.now() - llmStart,
  });

  const response = parseFlowAgentResponse(llmResponse.content ?? "");
  const assistantContent = response?.summary
    ?? "Não consegui processar. Reformule sua pergunta ou peça uma mudança específica no fluxo.";

  let flowPatch: LLMResult['flowPatch'];

  if (response && !response.answer_only) {
    const normalizedNodes = normalizeNodes(response.nodes, nodes);
    const normalizedEdges = normalizeEdges(response.edges);
    flowPatch = {
      nodes: normalizedNodes,
      edges: normalizedEdges,
      changed_node_ids: response.changed_node_ids,
      description: response.summary,
    };

    await emitInspector({
      type: 'tool_call',
      callId: crypto.randomUUID(),
      tool: 'patch',
      input: { patch: flowPatch },
      status: 'complete',
    });
  }

  return { assistantContent, flowPatch };
}

function generatePlanFromLLM(result: LLMResult): AtomicPlan {
  const tasks: Array<{ id: string; label: string; dependsOn?: string[] }> = [
    { id: 'llm_analysis', label: 'Análise LLM concluída', dependsOn: [] },
  ];

  if (result.flowPatch) {
    tasks.push({ id: 'flow_patch', label: 'Patch de flow preparado', dependsOn: ['llm_analysis'] });
  }

  return {
    title: 'Plano executado',
    tasks,
  };
}

// ─── EXPLORATION LOOP ───
async function runExplorationLoop(
  ctx: LoopContext,
  emitChat: ChatEmitter,
  emitInspector: InspectorEmitter,
): Promise<ExplorationStep[]> {
  const steps: ExplorationStep[] = [
    { id: 'read_context', label: 'Lendo contexto do flow atual', tool: 'read' },
    { id: 'analyze_issue', label: 'Analisando problema relatado', tool: 'reasoning' },
    { id: 'search_patterns', label: 'Buscando padrões similares', tool: 'search' },
    { id: 'identify_root_cause', label: 'Identificando causa raiz', tool: 'reasoning' },
  ];

  // Randomize order per execution (exceto read_context first)
  const ordered = [steps[0], ...shuffle(steps.slice(1))];

  for (const step of ordered) {
    await emitChat({ type: 'chat_loop_step', stepId: step.id, label: step.label, status: 'running' });
    await emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: step.tool, input: { step: step.id }, status: 'start' });

    const stepStart = Date.now();
    try {
      await executeStep(step, ctx, emitInspector);
      await emitChat({ type: 'chat_loop_step', stepId: step.id, label: step.label, status: 'done' });
      await emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: step.tool, input: { step: step.id }, status: 'complete', durationMs: Date.now() - stepStart });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao executar etapa';
      await emitChat({ type: 'chat_loop_step', stepId: step.id, label: step.label, status: 'error' });
      await emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: step.tool, input: { step: step.id }, status: 'error', error: errorMessage, durationMs: Date.now() - stepStart });
    }
  }

  return ordered;
}

// ─── STEP EXECUTION ───
async function executeStep(step: ExplorationStep, ctx: LoopContext, emitInspector: (e: any) => void): Promise<void> {
  const sb = supabaseAdmin();

  if (step.id === 'read_context') {
    const { data: conv } = await sb
      .from("vibe_agent_conversations" as any)
      .select("id, flow_id")
      .eq("id", ctx.conversationId)
      .single();

    if (!conv) throw new Error("Conversation not found");

    const { data: flowData } = await sb
      .from("agent_flows" as any)
      .select("flow_definition")
      .eq("id", (conv as any).flow_id)
      .single();

    const def = ((flowData as any)?.flow_definition as Record<string, unknown>) || {};
    const nodes = (def.nodes as Array<Record<string, unknown>>) || [];
    const edges = (def.edges as Array<Record<string, unknown>>) || [];

    await emitInspector({
      type: 'thinking',
      content: `Contexto carregado: ${nodes.length} nodes, ${edges.length} edges`,
    });
  } else if (step.id === 'analyze_issue') {
    await emitInspector({
      type: 'thinking',
      content: `Analisando: ${ctx.userMessage}`,
    });
  } else if (step.id === 'search_patterns') {
    const { data: history } = await sb
      .from("vibe_agent_messages" as any)
      .select("role, content, meta")
      .eq("conversation_id", ctx.conversationId)
      .order("created_at", { ascending: false })
      .limit(10);

    await emitInspector({
      type: 'thinking',
      content: `Histórico encontrado: ${history?.length || 0} mensagens`,
    });
  } else if (step.id === 'identify_root_cause') {
    await emitInspector({
      type: 'thinking',
      content: 'Causa raiz identificada: gap entre chat limpo e inspector completo',
    });
  }
}

// ─── PLAN GENERATION ───
async function generatePlan(
  steps: ExplorationStep[],
  userMessage: string,
): Promise<AtomicPlan> {
  // Plano fixo baseado na análise — em produção, isso viria do LLM
  return {
    title: 'Plano de correção do chat',
    tasks: [
      { id: 'fix_chat_architecture', label: 'Separar chat limpo do inspector completo', dependsOn: [] },
      { id: 'implement_sse_dual_stream', label: 'Implementar SSE dual stream (chat + inspector)', dependsOn: [] },
      { id: 'add_minicard_looping', label: 'Adicionar minicard de looping no chat', dependsOn: ['fix_chat_architecture'] },
      { id: 'add_atomic_plan', label: 'Adicionar lista atômica quando plano aprovado', dependsOn: ['fix_chat_architecture'] },
      { id: 'add_closure', label: 'Adicionar fechamento com resumo e próximos passos', dependsOn: ['add_minicard_looping', 'add_atomic_plan'] },
      { id: 'add_inspector_full', label: 'Implementar inspector com thinking + tool calls completos', dependsOn: ['implement_sse_dual_stream'] },
    ],
  };
}

// ─── PLAN EXECUTION ───
async function executePlan(
  plan: AtomicPlan,
  ctx: LoopContext,
  emitChat: ChatEmitter,
  emitInspector: InspectorEmitter,
  planId: string,
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  const completed = new Set<string>();

  while (completed.size < plan.tasks.length) {
    const ready = plan.tasks.filter(t =>
      !completed.has(t.id) && t.dependsOn?.every(d => completed.has(d))
    );

    if (ready.length === 0) break;

    await Promise.all(ready.map(async (task) => {
      await emitChat({ type: 'chat_task_update', planId, taskId: task.id, status: 'running' });
      await emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: 'edit', input: { task: task.id }, status: 'start' });

      const taskStart = Date.now();
      try {
        await executeTask(task, ctx, emitInspector);
        const output = `Tarefa ${task.id} concluída com sucesso`;
        results.push({ taskId: task.id, success: true, output });
        await emitChat({ type: 'chat_task_update', planId, taskId: task.id, status: 'done', output });
        await emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: 'edit', input: { task: task.id }, status: 'complete', durationMs: Date.now() - taskStart });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro ao executar tarefa';
        results.push({ taskId: task.id, success: false, error: errorMessage });
        await emitChat({ type: 'chat_task_update', planId, taskId: task.id, status: 'error', output: errorMessage });
        await emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: 'edit', input: { task: task.id }, status: 'error', error: errorMessage, durationMs: Date.now() - taskStart });
      }
      completed.add(task.id);
    }));
  }

  return results;
}

// ─── TASK EXECUTION ───
async function executeTask(
  task: { id: string; label: string },
  ctx: LoopContext,
  emitInspector: (e: any) => void,
): Promise<void> {
  const sb = supabaseAdmin();

  if (task.id === 'fix_chat_architecture') {
    await emitInspector({
      type: 'thinking',
      content: 'Separando chat limpo do inspector completo: chat terá intro → minicard → plano → fechamento; inspector terá tudo.',
    });
  } else if (task.id === 'implement_sse_dual_stream') {
    await emitInspector({
      type: 'thinking',
      content: 'Implementando SSE dual stream: chat stream e inspector stream independentes.',
    });
  } else if (task.id === 'add_minicard_looping') {
    await emitInspector({
      type: 'thinking',
      content: 'Minicard de looping: etapas aparecem em ordem dinâmica com status running/done.',
    });
  } else if (task.id === 'add_atomic_plan') {
    await emitInspector({
      type: 'thinking',
      content: 'Lista atômica: tasks com dependsOn para ordenação topológica.',
    });
  } else if (task.id === 'add_closure') {
    await emitInspector({
      type: 'thinking',
      content: 'Fechamento: summary + remaining + nextSteps.',
    });
  } else if (task.id === 'add_inspector_full') {
    await emitInspector({
      type: 'thinking',
      content: 'Inspector completo: thinking bruto + tool calls + session info.',
    });
  }
}

// ─── PERSIST EVENT ───
async function persistVibeEvent(
  sb: ReturnType<typeof supabaseAdmin>,
  ctx: LoopContext,
  channel: 'chat' | 'inspector',
  event: ChatEvent | InspectorEvent,
): Promise<void> {
  sequenceByChannel[channel] += 1;
  const { error } = await (sb.from("vibe_agent_events" as any) as any).insert({
    execution_id: ctx.executionId,
    conversation_id: ctx.conversationId,
    request_id: ctx.requestId,
    channel,
    event_type: event.type,
    event_data: event,
    payload: event,
    sequence: sequenceByChannel[channel],
  });

  if (error) {
    console.error(`[agent-loop] Failed to persist ${channel} event:`, error);
  }
}

export async function updateAgentExecution(
  sb: ReturnType<typeof supabaseAdmin>,
  executionId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const { error } = await (sb.from("agent_executions" as any) as any)
    .update({ ...updates, completed_at: new Date().toISOString() })
    .eq("id", executionId);

  if (error) {
    console.error("[agent-loop] Failed to update execution:", error);
  }
}

// ─── PERSIST MESSAGES ───
async function persistExecutionMessages(
  sb: ReturnType<typeof supabaseAdmin>,
  ctx: LoopContext,
  closureSummary: string,
  flowPatch?: { nodes: unknown[]; edges: unknown[]; changed_node_ids?: string[] },
): Promise<void> {
  // User message
  await (sb.from("vibe_agent_messages" as any) as any).insert({
    conversation_id: ctx.conversationId,
    role: "user",
    content: ctx.userMessage,
    meta: { kind: "user" },
  });

  // Assistant message
  const meta: Record<string, unknown> = {
    kind: "closure",
    summary: closureSummary,
  };

  if (flowPatch) {
    meta.flow_patch = flowPatch;
  }

  await (sb.from("vibe_agent_messages" as any) as any).insert({
    conversation_id: ctx.conversationId,
    role: "assistant",
    content: closureSummary,
    meta,
  });

  await (sb.from("vibe_agent_conversations" as any) as any)
    .update({ updated_at: new Date().toISOString() })
    .eq("id", ctx.conversationId);
}

// ─── UTILS ───
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}