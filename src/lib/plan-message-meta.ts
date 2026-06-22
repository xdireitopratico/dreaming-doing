import type { ChatMessage } from "@/lib/chat-types";
import type { PendingPlan, PlanStep } from "@/lib/agent-progress";

/** Run pertence ao histórico desta conversa (assistant ou buildRunId em user). */
export function runBelongsToChatMessages(
  runId: string | null | undefined,
  messages: ChatMessage[],
): boolean {
  if (!runId) return false;
  for (const msg of messages) {
    if (msg.runId === runId) return true;
    const meta = msg.meta as Record<string, unknown> | undefined;
    if (typeof meta?.runId === "string" && meta.runId === runId) return true;
    if (typeof meta?.buildRunId === "string" && meta.buildRunId === runId) return true;
  }
  return false;
}

/** Último plano pendente persistido no histórico (sobrevive a F5). */
export function findPendingPlanFromMessages(messages: ChatMessage[]): PendingPlan | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const stored = storedPlanFromMessage(msg);
    if (stored?.status === "pending") return stored.plan;
  }
  return null;
}

/** Plano ativo: memória do agente ou último pendente no chat. */
function livePlanBelongsToSession(
  live: PendingPlan,
  messages: ChatMessage[],
  activeRunId?: string | null,
): boolean {
  if (runBelongsToChatMessages(live.runId, messages)) return true;
  return !!activeRunId && activeRunId === live.runId;
}

export function resolvePendingPlan(
  live: PendingPlan | null | undefined,
  messages: ChatMessage[],
  activeRunId?: string | null,
): PendingPlan | null {
  if (live && livePlanBelongsToSession(live, messages, activeRunId)) return live;
  return findPendingPlanFromMessages(messages);
}

/**
 * true só se tem plano PENDENTE que o usuário PRECISA aprovar/rejeitar AGORA
 * para o chat continuar fluido.
 * Planos antigos ou já processados não bloqueiam o input.
 */
export function needsPlanApprovalNow(
  live: PendingPlan | null | undefined,
  messages: ChatMessage[],
  activeRunId?: string | null,
): boolean {
  const plan = resolvePendingPlan(live, messages, activeRunId);
  if (!plan) return false;

  const stored = findStoredPlanForPlan(plan, messages);
  if (stored?.status === "approved" || stored?.status === "rejected") return false;
  if (stored?.status === "pending") return true;

  if (live && livePlanBelongsToSession(live, messages, activeRunId)) return true;

  // cardSnapshot.awaitingKind sem planStatus no topo (88764445)
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const meta = m.meta as Record<string, unknown> | undefined;
    if (!meta) continue;
    const snapPlan = meta.cardSnapshot
      ? pendingPlanFromCardSnapshot(cardSnapshotRecord(meta) ?? {}, meta)
      : null;
    if (snapPlan?.planId !== plan.planId) continue;
    if (awaitingKindFromMessageMeta(meta) === "plan_approval") return true;
  }

  return false;
}

function findStoredPlanForPlan(plan: PendingPlan, messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const s = storedPlanFromMessage(m);
    if (s && s.plan.planId === plan.planId) return s;
  }
  return null;
}

function cardSnapshotRecord(meta: Record<string, unknown>): Record<string, unknown> | null {
  const snap = meta.cardSnapshot;
  return snap && typeof snap === "object" ? (snap as Record<string, unknown>) : null;
}

/** awaitingKind no topo ou dentro de cardSnapshot (run 88764445). */
export function awaitingKindFromMessageMeta(
  meta: Record<string, unknown> | undefined,
): "clarify" | "plan_approval" | null {
  if (!meta) return null;
  const top = meta.awaitingKind;
  if (top === "clarify" || top === "plan_approval" || top === "qualify") {
    return top === "qualify" ? "clarify" : top;
  }
  const snap = cardSnapshotRecord(meta);
  if (snap?.awaitingKind === "clarify" || snap?.awaitingKind === "qualify") return "clarify";
  if (snap?.awaitingKind === "plan_approval") return "plan_approval";
  return null;
}

function planStatusFromMessageMeta(meta: Record<string, unknown>): StoredPlanStatus {
  const statusRaw = meta.planStatus;
  if (statusRaw === "approved" || statusRaw === "rejected" || statusRaw === "pending") {
    return statusRaw;
  }
  if (awaitingKindFromMessageMeta(meta) === "plan_approval") return "pending";
  return "pending";
}

function pendingPlanFromCardSnapshot(
  snap: Record<string, unknown>,
  meta: Record<string, unknown>,
): PendingPlan | null {
  const raw = snap.pendingPlan;
  if (!raw || typeof raw !== "object") return null;
  const nested = raw as Record<string, unknown>;
  const planId = typeof nested.planId === "string" ? nested.planId : null;
  const steps = asPlanSteps(nested.steps);
  const runId =
    typeof nested.runId === "string"
      ? nested.runId
      : typeof meta.runId === "string"
        ? meta.runId
        : null;
  const projectId =
    typeof nested.projectId === "string"
      ? nested.projectId
      : typeof meta.projectId === "string"
        ? meta.projectId
        : "";
  if (!planId || !runId || steps.length === 0) return null;

  return {
    planId,
    summary: typeof nested.summary === "string" ? nested.summary : "Plano proposto",
    rationale:
      typeof nested.rationale === "string" && nested.rationale.trim()
        ? nested.rationale.trim()
        : undefined,
    markdown:
      typeof nested.markdown === "string" && nested.markdown.trim()
        ? nested.markdown.trim()
        : undefined,
    mission: typeof nested.mission === "string" ? nested.mission : undefined,
    objective: typeof nested.objective === "string" ? nested.objective : undefined,
    steps,
    ttlMs: Number.MAX_SAFE_INTEGER,
    proposedAt: typeof nested.proposedAt === "number" ? nested.proposedAt : Date.now(),
    runId,
    projectId,
  };
}

export type ResolveJobPlanOptions = {
  livePlan?: PendingPlan | null;
  progressPlan?: PendingPlan | null;
  assistantMessage?: ChatMessage;
};

/** Plano/requisitos do job para um runId — usado no mini-card (não confundir com timeline SSE). */
export function resolveJobPlanForRun(
  runId: string,
  messages: ChatMessage[],
  opts: ResolveJobPlanOptions = {},
): PendingPlan | null {
  const { livePlan, progressPlan, assistantMessage } = opts;

  if (livePlan?.runId === runId && livePlan.steps.length > 0) return livePlan;
  if (progressPlan?.runId === runId && progressPlan.steps.length > 0) return progressPlan;

  if (assistantMessage) {
    const stored = storedPlanFromMessage(assistantMessage);
    if (stored?.plan.runId === runId && stored.plan.steps.length > 0) return stored.plan;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "user") continue;
    const meta = msg.meta as Record<string, unknown> | undefined;
    if (meta?.buildRunId !== runId) continue;
    const planSourceRunId = typeof meta.planSourceRunId === "string" ? meta.planSourceRunId : null;
    const planId = typeof meta.planId === "string" ? meta.planId : null;
    if (!planSourceRunId) continue;

    for (let j = messages.length - 1; j >= 0; j--) {
      const am = messages[j];
      if (am?.role !== "assistant") continue;
      const ameta = am.meta as Record<string, unknown> | undefined;
      if (ameta?.runId !== planSourceRunId) continue;
      if (planId && ameta.planId !== planId) continue;
      const stored = storedPlanFromMessage(am);
      if (stored?.plan.steps.length) return stored.plan;
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const stored = storedPlanFromMessage(msg);
    if (stored?.plan.runId === runId && stored.plan.steps.length > 0) return stored.plan;
  }

  return null;
}

export type StoredPlanStatus = "pending" | "rejected" | "approved";

/** runId/planId no topo ou dentro de cardSnapshot.pendingPlan (run 88764445). */
export function planIdsFromMessageMeta(meta: Record<string, unknown>): {
  runId: string | null;
  planId: string | null;
} {
  const runId = typeof meta.runId === "string" ? meta.runId : null;
  const planId = typeof meta.planId === "string" ? meta.planId : null;
  if (runId && planId) return { runId, planId };

  const snap = cardSnapshotRecord(meta);
  const nested = snap?.pendingPlan;
  if (nested && typeof nested === "object") {
    const n = nested as Record<string, unknown>;
    return {
      runId: typeof n.runId === "string" ? n.runId : runId,
      planId: typeof n.planId === "string" ? n.planId : planId,
    };
  }
  return { runId, planId };
}

export function messageMetaMatchesPlan(
  meta: Record<string, unknown> | undefined,
  runId: string,
  planId: string,
): boolean {
  if (!meta) return false;
  const ids = planIdsFromMessageMeta(meta);
  return ids.runId === runId && ids.planId === planId;
}

/** Atualiza meta da mensagem assistant ao rejeitar (inclui cardSnapshot-only). */
/** Localiza mensagem assistant do plano (topo ou cardSnapshot). */
export function findAssistantMessageForPlan<
  T extends { id: string; meta?: unknown },
>(messages: T[], runId: string, planId: string): T | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (messageMetaMatchesPlan(m.meta as Record<string, unknown> | undefined, runId, planId)) {
      return m;
    }
  }
  return null;
}

export function patchPlanMessageMetaRejected(
  meta: Record<string, unknown>,
  rejectedAt: string,
): Record<string, unknown> {
  const ids = planIdsFromMessageMeta(meta);
  const next: Record<string, unknown> = {
    ...meta,
    planStatus: "rejected",
    planRejectedAt: rejectedAt,
  };
  if (ids.planId) next.planId = ids.planId;
  if (ids.runId) next.runId = ids.runId;

  const snap = cardSnapshotRecord(meta);
  if (snap) {
    const patchedSnap: Record<string, unknown> = { ...snap, awaiting: false };
    delete patchedSnap.awaitingKind;
    next.cardSnapshot = patchedSnap;
  }
  return next;
}

export type InspectorPlanState = {
  plan: PendingPlan;
  status: StoredPlanStatus;
  awaitingApproval: boolean;
};

/** Último plano persistido no meta para um runId (histórico DB-first). */
export function findStoredPlanForRunId(
  runId: string,
  messages: ChatMessage[],
): StoredPlanMeta | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const stored = storedPlanFromMessage(msg);
    if (stored?.plan.runId === runId) return stored;
  }
  return null;
}

/** Plano do inspector — DB-first; live só enquanto aguarda aprovação. */
export function resolveInspectorPlanForRun(
  runId: string,
  messages: ChatMessage[],
  opts: ResolveJobPlanOptions = {},
): InspectorPlanState | null {
  const plan = resolveJobPlanForRun(runId, messages, opts);
  if (!plan) return null;

  const stored = findStoredPlanForRunId(runId, messages);
  const status: StoredPlanStatus = stored?.status ?? "pending";
  const liveMatches = opts.livePlan?.runId === runId;

  const awaitingApproval =
    status === "pending" &&
    (liveMatches || needsPlanApprovalNow(liveMatches ? opts.livePlan : null, messages));

  return { plan, status, awaitingApproval };
}

export function planHeadlineFromPlan(plan: PendingPlan): string {
  return plan.mission?.trim() || plan.summary?.trim() || "Plano proposto";
}

/** Corpo do plano no inspector — parágrafo único legível (referência Lovable img 14). */
export function planParagraphFromPlan(plan: PendingPlan): string {
  const markdown = plan.markdown?.trim();
  if (markdown && !/^##\s/m.test(markdown)) return markdown;

  const mission = plan.mission?.trim();
  const objective = plan.objective?.trim();
  if (mission) return mission;
  if (objective) return objective;
  return plan.summary?.trim() || "Plano proposto";
}

/* ─── Structured plan view (ChatPlanDock A1) ──────────────────────────── */

export type PlanStepView = {
  id: string;
  description: string;
  type: PlanStep["type"];
  filePath?: string;
  enabled: boolean;
};

export type PlanPhaseView = {
  index: number;
  title: string;
  steps: PlanStepView[];
};

/**
 * Extract structured phases + steps from PendingPlan for visual rendering.
 *
 * Priority:
 *  1. If `plan.markdown` contains `## Fases` → parse phases from markdown headings
 *  2. If `plan.steps` has >= 1 step → group by step type into logical phases
 *  3. Fallback → single "Entregas" phase with `planParagraphFromPlan` as description
 */
export function planPhasesFromPlan(plan: PendingPlan): PlanPhaseView[] {
  const markdown = plan.markdown?.trim();

  // ── Strategy 1: markdown with ## Fases ──
  if (markdown && /##\s+Fases/im.test(markdown)) {
    const phases = parsePhasesFromMarkdown(markdown);
    if (phases.length > 0) return phases;
  }

  // ── Strategy 2: structured steps array ──
  const enabledSteps = (plan.steps ?? []).filter((s) => s.enabled !== false);
  if (enabledSteps.length > 0) {
    return groupStepsByType(enabledSteps);
  }

  // ── Strategy 3: fallback to mission/summary ──
  const body = planParagraphFromPlan(plan);
  if (body && body !== "Plano proposto") {
    return [
      {
        index: 0,
        title: "Plano",
        steps: [{ id: "s0", description: body, type: "custom", enabled: true }],
      },
    ];
  }

  return [];
}

function parsePhasesFromMarkdown(markdown: string): PlanPhaseView[] {
  const phases: PlanPhaseView[] = [];
  const phaseBlocks = markdown.split(/^###\s+/m).filter(Boolean);

  // First block before any ### is usually preamble — skip if no checklist
  for (let i = 0; i < phaseBlocks.length; i++) {
    const block = phaseBlocks[i];
    const lines = block.split("\n");

    // Extract phase title from first line (after ###)
    const titleMatch = lines[0]?.match(/^###\s+(.+)$/i);
    const title = titleMatch?.[1]?.trim() || (i === 0 ? "Visão Geral" : `Fase ${i + 1}`);

    // Extract bullet/checklist items as steps
    const steps: PlanStepView[] = [];
    for (const line of lines) {
      const trimmed = line.trim();

      // Checkbox items: - [ ] or - [x]
      const check = trimmed.match(/^[-*]\s+\[[ xX]\]\s+(.+)$/);
      if (check?.[1]) {
        steps.push({
          id: `phase-${i + 1}-${steps.length}`,
          description: check[1].trim(),
          type: inferStepType(check[1]),
          enabled: !/[xX]/.test(trimmed.split("[")[1]?.[0] ?? ""),
        });
        continue;
      }

      // Regular bullets (only if inside a ### block)
      if (i > 0) {
        const bullet = trimmed.match(/^[-*]\s+(.+)$/);
        if (bullet?.[1]) {
          steps.push({
            id: `phase-${i + 1}-${steps.length}`,
            description: bullet[1].trim(),
            type: inferStepType(bullet[1]),
            enabled: true,
          });
        }
      }
    }

    // Only add phases that have actual steps (skip preamble with no items)
    if (steps.length > 0 || i === 0) {
      if (steps.length > 0) {
        phases.push({ index: phases.length, title, steps });
      }
    }
  }

  return phases;
}

function inferStepType(description: string): PlanStep["type"] {
  const lower = description.toLowerCase();
  if (/criar|create|new file|novo ficheiro/i.test(lower)) return "create_file";
  if (/editar|edit|modif|alterar|update/i.test(lower)) return "edit_file";
  if (/instal|npm|bun|dep/i.test(lower)) return "install_dep";
  if (/executar|run|script|command/i.test(lower)) return "shell_exec";
  if (/verificar|check|valid|observ/i.test(lower)) return "observe";
  return "custom";
}

function groupStepsByType(steps: PlanStep[]): PlanPhaseView[] {
  const groups = new Map<string, PlanStepView[]>();

  for (const step of steps) {
    const group = phaseLabelForType(step.type);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push({
      id: step.id,
      description: step.description,
      type: step.type,
      filePath: step.filePath,
      enabled: step.enabled,
    });
  }

  const phases: PlanPhaseView[] = [];
  groups.forEach((steps, title) => {
    phases.push({ index: phases.length, title, steps });
  });

  return phases;
}

function phaseLabelForType(type: PlanStep["type"]): string {
  switch (type) {
    case "create_file":
      return "Criação de arquivos";
    case "edit_file":
      return "Edições";
    case "shell_exec":
      return "Execução de comandos";
    case "install_dep":
      return "Dependências";
    case "observe":
      return "Verificação";
    default:
      return "Entregas";
  }
}

export type StoredPlanMeta = {
  status: StoredPlanStatus;
  plan: PendingPlan;
};

function asPlanSteps(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s === "object") as PlanStep[];
}

/** Plano persistido no meta da mensagem assistant (histórico Lovable). */
export function storedPlanFromMessage(message?: ChatMessage): StoredPlanMeta | null {
  if (!message?.meta) return null;
  const meta = message.meta as Record<string, unknown>;

  const planId = typeof meta.planId === "string" ? meta.planId : null;
  const runId = typeof meta.runId === "string" ? meta.runId : null;
  const steps = asPlanSteps(meta.planSteps);

  let plan: PendingPlan | null = null;
  if (planId && runId && steps.length > 0) {
    plan = {
      planId,
      summary: typeof meta.planSummary === "string" ? meta.planSummary : "Plano proposto",
      rationale:
        typeof meta.planRationale === "string" && meta.planRationale.trim()
          ? meta.planRationale.trim()
          : undefined,
      markdown:
        typeof meta.planMarkdown === "string" && meta.planMarkdown.trim()
          ? meta.planMarkdown.trim()
          : undefined,
      mission: typeof meta.planMission === "string" ? meta.planMission : undefined,
      objective: typeof meta.planObjective === "string" ? meta.planObjective : undefined,
      steps,
      ttlMs: Number.MAX_SAFE_INTEGER,
      proposedAt: Date.now(),
      runId,
      projectId: typeof meta.projectId === "string" ? meta.projectId : "",
    };
  } else {
    const snap = cardSnapshotRecord(meta);
    if (snap) plan = pendingPlanFromCardSnapshot(snap, meta);
  }

  if (!plan) return null;

  return {
    status: planStatusFromMessageMeta(meta),
    plan,
  };
}
