import type { AuditEntry } from "@/components/editor/AuditLog";

export type AgentRunRow = {
  id: string;
  project_id: string;
  conversation_id: string;
  user_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  canceled_at: string | null;
  steps: number;
  error: string | null;
  meta: Record<string, unknown> | null;
};

export function mapRunStatus(status: string): AuditEntry["status"] {
  if (status === "canceled") return "stopped";
  if (status === "running" || status === "completed" || status === "failed") return status;
  return "failed";
}

export function parseRunMeta(meta: Record<string, unknown> | null | undefined) {
  const m = meta ?? {};
  return {
    provider: typeof m.provider === "string" ? m.provider : "FORGE",
    model: typeof m.model === "string" ? m.model : "—",
    summary: typeof m.summary === "string" ? m.summary : undefined,
    toolsUsed: Array.isArray(m.toolsUsed)
      ? m.toolsUsed.filter((t): t is string => typeof t === "string")
      : [],
    sessionKind: typeof m.sessionKind === "string" ? m.sessionKind : undefined,
    resume: m.resume === true,
  };
}

export function agentRunToAuditEntry(run: AgentRunRow, projectName: string): AuditEntry {
  const meta = parseRunMeta(run.meta);
  return {
    id: run.id,
    projectId: run.project_id,
    projectName,
    provider: meta.provider,
    model: meta.model,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    status: mapRunStatus(run.status),
    steps: run.steps,
    cost: 0,
    toolsUsed: meta.toolsUsed,
    error: run.error ?? undefined,
    summary: meta.summary,
  };
}

/** Mensagens do assistente dentro da janela temporal de uma execução. */
export function filterMessagesForRun<T extends { created_at: string }>(
  messages: T[],
  run: Pick<AgentRunRow, "started_at" | "finished_at">,
): T[] {
  const start = new Date(run.started_at).getTime();
  const end = run.finished_at ? new Date(run.finished_at).getTime() + 3000 : Date.now();
  return messages.filter((m) => {
    const t = new Date(m.created_at).getTime();
    return t >= start - 500 && t <= end;
  });
}