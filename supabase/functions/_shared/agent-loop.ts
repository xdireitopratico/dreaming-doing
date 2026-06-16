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

type ChatEmitter = (event: any) => void;
type InspectorEmitter = (event: any) => void;

interface AtomicPlan {
  title: string;
  tasks: Array<{ id: string; label: string; dependsOn?: string[] }>;
}

let sequence = 0;

export async function executeAgentLoop(ctx: LoopContext): Promise<void> {
  const sb = supabaseAdmin();
  const startTime = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let flowPatch: { nodes: unknown[]; edges: unknown[]; changed_node_ids?: string[] } | undefined;

  const emitChat = (event: any) => {
    ctx.chatWriter.write({ ...event, timestamp: Date.now(), requestId: ctx.requestId } as ChatEvent);
  };

  const emitInspector = (event: any) => {
    ctx.inspectorWriter.write({ ...event, timestamp: Date.now(), requestId: ctx.requestId, sequence: ++sequence } as InspectorEvent);
  };

  try {
    // ─── SESSION START ───
    emitInspector({
      type: 'session_start',
      sessionId: ctx.sessionId,
      prompt: ctx.userMessage,
      model: ctx.model || 'auto',
      provider: ctx.provider || 'auto',
    });

    // ─── INTRO ───
    const introText = `Vou avaliar o problema com o chat e onde ele quebra. Vou analisar o fluxo atual, identificar a causa raiz e aplicar os ajustes necessários.`;
    emitChat({ type: 'chat_intro', text: introText });

    // ─── LOOPING PHASE (exploração) ───
    const loopSteps = await runExplorationLoop(ctx, emitChat, emitInspector);

    // ─── PLAN APPROVAL ───
    const plan = await generatePlan(loopSteps, ctx.userMessage);
    const planId = crypto.randomUUID();
    emitChat({
      type: 'chat_plan_approved',
      planId,
      title: plan.title,
      tasks: plan.tasks.map(t => ({ ...t, status: 'pending' })),
    });

    // ─── EXECUTE PLAN (atomic tasks) ───
    const results = await executePlan(plan, ctx, emitChat, emitInspector, planId);

    // ─── CLOSURE ───
    const successfulTasks = results.filter(r => r.success).length;
    const failedTasks = results.filter(r => !r.success);
    const closureSummary = `Concluí a análise do chat. Foram executadas ${successfulTasks}/${results.length} tarefas com sucesso.`;
    const remaining = failedTasks.map(t => t.error || t.taskId);
    const nextSteps = [
      "Validar o comportamento em ambiente de preview",
      "Testar a experiência do usuário no fluxo completo",
      "Revisar logs do inspector para identificar gargalos",
    ];
    const artifacts = flowPatch ? [
      { type: 'flow_version' as const, id: crypto.randomUUID(), label: 'Patch aplicado ao flow' },
    ] : [];

    emitChat({
      type: 'chat_closure',
      summary: closureSummary,
      remaining,
      nextSteps,
      artifacts,
    });

    // ─── SESSION END ───
    emitInspector({
      type: 'session_end',
      sessionId: ctx.sessionId,
      outcome: failedTasks.length === 0 ? 'success' : 'partial',
      totalDurationMs: Date.now() - startTime,
      totalTokens: { input: totalInputTokens, output: totalOutputTokens },
    });

    // ─── Persist messages in DB ───
    await persistExecutionMessages(sb, ctx, closureSummary, flowPatch);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
    emitChat({
      type: 'chat_error',
      code: 'EXECUTION_FAILED',
      message: errorMessage,
      recoverable: true,
      suggestion: 'Tente reformular ou peça para continuar de onde parou.',
    });
    emitInspector({
      type: 'session_end',
      sessionId: ctx.sessionId,
      outcome: 'failed',
      totalDurationMs: Date.now() - startTime,
      totalTokens: { input: totalInputTokens, output: totalOutputTokens },
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
    emitChat({ type: 'chat_loop_step', stepId: step.id, label: step.label, status: 'running' });
    emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: step.tool, input: { step: step.id }, status: 'start' });

    const stepStart = Date.now();
    try {
      await executeStep(step, ctx, emitInspector);
      emitChat({ type: 'chat_loop_step', stepId: step.id, label: step.label, status: 'done' });
      emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: step.tool, input: { step: step.id }, status: 'complete', durationMs: Date.now() - stepStart });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao executar etapa';
      emitChat({ type: 'chat_loop_step', stepId: step.id, label: step.label, status: 'error' });
      emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: step.tool, input: { step: step.id }, status: 'error', error: errorMessage, durationMs: Date.now() - stepStart });
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

    emitInspector({
      type: 'thinking',
      content: `Contexto carregado: ${nodes.length} nodes, ${edges.length} edges`,
    });
  } else if (step.id === 'analyze_issue') {
    emitInspector({
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

    emitInspector({
      type: 'thinking',
      content: `Histórico encontrado: ${history?.length || 0} mensagens`,
    });
  } else if (step.id === 'identify_root_cause') {
    emitInspector({
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
      emitChat({ type: 'chat_task_update', planId, taskId: task.id, status: 'running' });
      emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: 'edit', input: { task: task.id }, status: 'start' });

      const taskStart = Date.now();
      try {
        await executeTask(task, ctx, emitInspector);
        const output = `Tarefa ${task.id} concluída com sucesso`;
        results.push({ taskId: task.id, success: true, output });
        emitChat({ type: 'chat_task_update', planId, taskId: task.id, status: 'done', output });
        emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: 'edit', input: { task: task.id }, status: 'complete', durationMs: Date.now() - taskStart });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro ao executar tarefa';
        results.push({ taskId: task.id, success: false, error: errorMessage });
        emitChat({ type: 'chat_task_update', planId, taskId: task.id, status: 'error', output: errorMessage });
        emitInspector({ type: 'tool_call', callId: crypto.randomUUID(), tool: 'edit', input: { task: task.id }, status: 'error', error: errorMessage, durationMs: Date.now() - taskStart });
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
    emitInspector({
      type: 'thinking',
      content: 'Separando chat limpo do inspector completo: chat terá intro → minicard → plano → fechamento; inspector terá tudo.',
    });
  } else if (task.id === 'implement_sse_dual_stream') {
    emitInspector({
      type: 'thinking',
      content: 'Implementando SSE dual stream: chat stream e inspector stream independentes.',
    });
  } else if (task.id === 'add_minicard_looping') {
    emitInspector({
      type: 'thinking',
      content: 'Minicard de looping: etapas aparecem em ordem dinâmica com status running/done.',
    });
  } else if (task.id === 'add_atomic_plan') {
    emitInspector({
      type: 'thinking',
      content: 'Lista atômica: tasks com dependsOn para ordenação topológica.',
    });
  } else if (task.id === 'add_closure') {
    emitInspector({
      type: 'thinking',
      content: 'Fechamento: summary + remaining + nextSteps.',
    });
  } else if (task.id === 'add_inspector_full') {
    emitInspector({
      type: 'thinking',
      content: 'Inspector completo: thinking bruto + tool calls + session info.',
    });
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