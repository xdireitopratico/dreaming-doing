/** SSOT — correlação tool_start/tool_done (toolCallId + fallback LIFO por nome). */

export type ToolInvocation = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  openedAt: number;
  ok?: boolean;
  error?: string;
  summary?: string;
  closedAt?: number;
};

export type ProgressToolRow = {
  name: string;
  args: Record<string, unknown>;
  ok?: boolean;
  error?: string;
  toolCallId?: string;
};

export function resolveInvocationId(toolCallId: string | undefined, seq: number): string {
  const id = toolCallId?.trim();
  return id || `tool-seq-${seq}`;
}

export function findPendingToolIndex(
  tools: Array<ProgressToolRow | ToolInvocation>,
  input: { name: string; toolCallId?: string | null },
): number {
  for (let i = tools.length - 1; i >= 0; i--) {
    const t = tools[i];
    if (t.ok !== undefined) continue;
    if (input.toolCallId) {
      if (t.toolCallId === input.toolCallId) return i;
      if ("id" in t && t.id === input.toolCallId) return i;
      continue;
    }
    if (t.name === input.name) return i;
  }
  return -1;
}

export function applyToolStartRow(
  tools: ProgressToolRow[],
  input: {
    name: string;
    args: Record<string, unknown>;
    toolCallId?: string;
  },
): ProgressToolRow[] {
  return [
    ...tools,
    {
      name: input.name,
      args: input.args,
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    },
  ];
}

export function applyToolDoneRow(
  tools: ProgressToolRow[],
  input: {
    name: string;
    toolCallId?: string | null;
    ok: boolean;
    error?: string;
  },
): ProgressToolRow[] {
  const idx = findPendingToolIndex(tools, input);
  if (idx < 0) return tools;
  const next = [...tools];
  next[idx] = {
    ...next[idx],
    ok: input.ok,
    error: input.error,
  };
  return next;
}

export type ToolLedger = {
  invocations: ToolInvocation[];
  indexById: Map<string, number>;
};

export function createToolLedger(): ToolLedger {
  return { invocations: [], indexById: new Map() };
}

export function openToolInvocation(
  ledger: ToolLedger,
  input: {
    name: string;
    args: Record<string, unknown>;
    toolCallId?: string;
    openedAt: number;
    seq: number;
  },
): { ledger: ToolLedger; invocation: ToolInvocation } {
  const id = resolveInvocationId(input.toolCallId, input.seq);
  const invocation: ToolInvocation = {
    id,
    name: input.name,
    args: input.args,
    openedAt: input.openedAt,
  };
  const invocations = [...ledger.invocations, invocation];
  const indexById = new Map(ledger.indexById);
  indexById.set(id, invocations.length - 1);
  return { ledger: { invocations, indexById }, invocation };
}

export function closeToolInvocation(
  ledger: ToolLedger,
  input: {
    name: string;
    toolCallId?: string | null;
    ok: boolean;
    error?: string;
    summary?: string;
    closedAt: number;
  },
): { ledger: ToolLedger; invocation: ToolInvocation | null } {
  const idx = findPendingToolIndex(ledger.invocations, input);
  if (idx < 0) return { ledger, invocation: null };
  const current = ledger.invocations[idx]!;
  const invocation: ToolInvocation = {
    ...current,
    ok: input.ok,
    error: input.error,
    summary: input.summary,
    closedAt: input.closedAt,
  };
  const invocations = [...ledger.invocations];
  invocations[idx] = invocation;
  return { ledger: { invocations, indexById: ledger.indexById }, invocation };
}