import type { ChatMessage } from "@/components/editor/ChatInput";
import { initialAgentProgress, type AgentProgress, type SSEEvent } from "@/lib/agent-progress";
import { timelineFromExecutionLog } from "@/lib/agent-job-stream";

export function runIdFromAssistantMessage(msg: ChatMessage): string | undefined {
  return (
    msg.runId ??
    (typeof msg.meta?.runId === "string" ? msg.meta.runId : undefined) ??
    (typeof msg.meta?.buildRunId === "string" ? msg.meta.buildRunId : undefined)
  );
}

/** Mensagem assistant ligada a um job do agente (mini-card Lovable). */
export function isAgentJobMessage(msg?: ChatMessage): boolean {
  if (!msg) return false;
  if (runIdFromAssistantMessage(msg)) return true;
  const meta = msg.meta;
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  if (typeof m.finishedAt === "string") return true;
  if (Array.isArray(m.deliveryFiles) && m.deliveryFiles.length > 0) return true;
  if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) return true;
  return false;
}

function timelineFromMeta(meta: Record<string, unknown>): SSEEvent[] {
  const streamTail = meta.streamTail;
  if (Array.isArray(streamTail) && streamTail.length > 0) {
    return streamTail as SSEEvent[];
  }
  const executionLog = meta.executionLog;
  if (Array.isArray(executionLog) && executionLog.length > 0) {
    return timelineFromExecutionLog(executionLog as string[]);
  }
  return [];
}

/** Reidrata progresso mínimo a partir do DB — mini-card persiste após reload/acknowledge. */
export function progressFromAssistantMessage(msg: ChatMessage): AgentProgress | null {
  if (!isAgentJobMessage(msg)) return null;

  const meta = (msg.meta ?? {}) as Record<string, unknown>;
  const finishedAt = typeof meta.finishedAt === "string";
  const deliveryFiles = Array.isArray(meta.deliveryFiles)
    ? (meta.deliveryFiles as string[])
    : [];
  const currentStep = typeof meta.currentStep === "number" ? meta.currentStep : null;
  const totalSteps = typeof meta.totalSteps === "number" ? meta.totalSteps : null;
  const body = msg.content?.trim() || null;

  const lastFinishOk =
    typeof meta.lastFinishOk === "boolean"
      ? meta.lastFinishOk
      : meta.buildFailed === true
        ? false
        : finishedAt
          ? null
          : null;

  const tools = (msg.toolCalls ?? []).map((tc) => ({
    name: tc.name,
    args:
      typeof tc.args === "string"
        ? ({ path: tc.args } as Record<string, unknown>)
        : ((tc.args as Record<string, unknown> | undefined) ?? {}),
    ok: true as const,
  }));

  const finished = finishedAt || lastFinishOk === true || lastFinishOk === false;
  const timeline = timelineFromMeta(meta);

  return {
    ...initialAgentProgress,
    phase: finished ? "done" : null,
    currentStep,
    totalSteps,
    tools,
    timeline,
    finished,
    lastFinishOk,
    streamText: body,
    summary: body,
    deliveryFiles,
  };
}