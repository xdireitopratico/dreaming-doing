# Chat Turn UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the assistant chat turn so it always shows: thinking state → narration → mini-card widget → closing prose, with the mini-card displaying a single live job-state line plus an atomic-task checklist.

**Architecture:** Keep the canonical timeline as the source of truth; derive the mini-card from it. Make the backend emit mandatory `assistant_text` opening and closing, and introduce a `task` event for atomic tasks in build mode. Tighten `AssistantTurn` and invariants on the frontend.

**Tech Stack:** React/TypeScript frontend, Deno Supabase edge function backend, shared `@forge/agent-contract` package.

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/agent-contract/src/events.ts` | SSOT event contract; adds `task` event. |
| `supabase/functions/agent-run/_events.ts` | Auto-generated mirror of contract. |
| `supabase/functions/agent-run/runtime/emitter.ts` | Maps raw events to canonical timeline events; adds `task` → `TASK`. |
| `supabase/functions/agent-run/runtime/phases/narration.ts` | Emits opening/narration/closing prose; ensures opening before work. |
| `supabase/functions/agent-run/runtime/phases/execute.ts` | Calls opening before work, emits tasks, guarantees closing on every exit path. |
| `supabase/functions/agent-run/runtime/phases/plan-turn.ts` | Calls opening before exploration tools, guarantees closing. |
| `supabase/functions/agent-run/runtime/phases/chat-turn.ts` | Guarantees closing on every failure path. |
| `supabase/functions/agent-run/tools/meta.ts` | Adds `declare_tasks` tool definition for build-mode atomic tasks. |
| `supabase/functions/agent-run/runtime/phases/snapshot.ts` | Persists task list in snapshot. |
| `src/lib/agent-progress.ts` | Reducer: handles `task` event, preserves final `assistant_text`. |
| `src/lib/timeline-builder.ts` | Maps `task` event to `TASK` ForgeTimelineItem. |
| `src/lib/forge-run.ts` | Builds mini-card data: single live line, task checklist, status. |
| `src/lib/chat/types.ts` | Updates `MiniCardData` to single live line + tasks with criteria. |
| `src/lib/chat/turn.ts` | Ensures mini-card is built from live line and tasks. |
| `src/lib/chat/invariants.ts` | Enforces strict Lovable order and suppresses closing during active run. |
| `src/lib/chat/turn-display.ts` | Keeps narration visible, does not suppress due to tools. |
| `src/components/chat/ChatJobCard.tsx` | Renders single live line + task checklist; removes 5-line activity dump. |

---

## Task 1: Add `task` event to agent contract

**Files:**
- Modify: `packages/agent-contract/src/events.ts:108`
- Test: `packages/agent-contract/src/events.test.ts` (create if missing)
- Sync: `supabase/functions/agent-run/_events.ts` via `npm run sync:agent-contract`

- [ ] **Step 1: Write the type change in contract**

Add a new union member to `AgentStreamEventData`:

```ts
| {
    type: "task";
    id: string;
    label: string;
    criteria?: string;
    active?: boolean;
    done?: boolean;
    failed?: boolean;
  }
```

Add `"task"` to `AGENT_STREAM_EVENT_TYPES`.

- [ ] **Step 2: Run sync**

```bash
cd /c/Users/jocim/Dreaming-doing/dreaming-doing
npm run sync:agent-contract
```

Expected output: `✓ agent-contract synced to edge mirrors`

- [ ] **Step 3: Commit**

```bash
git add packages/agent-contract/src/events.ts supabase/functions/agent-run/_events.ts

git commit -m "feat(contract): add task event for atomic build-mode tasks"
```

---

## Task 2: Backend emits opening before work in execute phase

**Files:**
- Modify: `supabase/functions/agent-run/runtime/phases/execute.ts:179-235`
- Modify: `supabase/functions/agent-run/runtime/phases/narration.ts:54-59`
- Test: `supabase/functions/agent-run/runtime/phases/execute.test.ts` (create if missing)

- [ ] **Step 1: Write failing test**

```ts
Deno.test("execute phase emits opening assistant_text before first tool_start", async () => {
  // minimal stubbed deps
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const deps = buildStubbedExecuteDeps({ emit: (t, d) => events.push({ type: t, data: d as Record<string, unknown> }) });
  await runBuildExecutePhase(deps, 0);
  const firstToolStart = events.findIndex((e) => e.type === "tool_start");
  const firstOpening = events.findIndex((e) => e.type === "assistant_text" && e.data.opening === true);
  assert(firstOpening >= 0, "missing opening");
  assert(firstOpening < firstToolStart, "opening must come before first tool_start");
});
```

Run: `cd supabase/functions/agent-run && deno test runtime/phases/execute.test.ts`
Expected: FAIL "missing opening"

- [ ] **Step 2: Implement retry loop that forces LLM to emit opening**

Inside `runBuildExecutePhase`, immediately before the main `while (!finalGateOk)` loop, verify opening was emitted. If `narrationPhase.openingEmitted` is false after the first LLM call, do NOT use fallback. Instead, inject a system message and re-call the LLM up to 2 times:

```ts
const OPENING_SYSTEM_PROMPT =
  "Você precisa começar respondendo ao usuário com UMA frase curta (máximo 140 caracteres) explicando o que vai fazer, antes de usar ferramentas. Não use templates genéricos como 'Entendi:'. Seja específico ao pedido.";

async function forceOpeningOrFail(deps: BuildExecuteDeps, instruction: string, history: ChatMessage[]): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (deps.narrationPhase.openingEmitted) return true;
    const nudgeResponse = await deps.llmChat(
      deps.executionModel,
      instruction,
      [...history, { role: "system", content: OPENING_SYSTEM_PROMPT }],
      false,
    );
    if (nudgeResponse?.content?.trim()) {
      deps.narrationPhase.emitOpening(nudgeResponse.content.trim());
      if (deps.narrationPhase.openingEmitted) return true;
    }
  }
  return false;
}
```

If it returns false, fail the run with a technical error:

```ts
const err = "O modelo não respondeu com a mensagem esperada.";
await deps.persistFinal(err, { lastFinishOk: false, buildFailed: true });
return { ok: false, error: err, steps: loopStep, resumable: false, toolsUsed: [...deps.toolsUsed] };
```

- [ ] **Step 3: Verify test passes**

Run: `deno test runtime/phases/execute.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/agent-run/runtime/phases/execute.ts supabase/functions/agent-run/runtime/phases/execute.test.ts

git commit -m "fix(execute): force LLM to emit opening prose, zero hardcoded fallback"
```

---

## Task 3: Backend guarantees closing prose on every exit path

**Files:**
- Modify: `supabase/functions/agent-run/runtime/phases/execute.ts:179-815`
- Modify: `supabase/functions/agent-run/runtime/phases/plan-turn.ts:86-119, 175-219, 692-700`
- Modify: `supabase/functions/agent-run/runtime/phases/chat-turn.ts:40-57, 102-124`
- Test: `supabase/functions/agent-run/runtime/phases/execute.test.ts`

- [ ] **Step 1: Write failing tests for error paths**

For each early-exit path in execute (fail-fast, read-only hard stop, tool miss, max retries, returnResumableChunk), assert that a final `assistant_text` is emitted.

```ts
Deno.test("execute fail-fast emits final assistant_text", async () => {
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const deps = buildStubbedExecuteDeps({ emit: (t, d) => events.push({ type: t, data: d as Record<string, unknown> }) });
  deps.executionModel = { chat: () => { throw new Error("rate limit"); } } as unknown as LLMProvider;
  deps.robinActive = false;
  await runBuildExecutePhase(deps, 0);
  const finals = events.filter((e) => e.type === "assistant_text" && e.data.final === true);
  assert(finals.length > 0, "missing final assistant_text");
});
```

Run: `deno test runtime/phases/execute.test.ts`
Expected: FAIL on at least one path.

- [ ] **Step 2: Add helper `emitFinalClosing` in narration.ts**

```ts
emitFinalClosing(text: string): void {
  const chunk = text.trim();
  if (!chunk) return;
  this.emit("assistant_text", { text: chunk, final: true, append: false });
}
```

- [ ] **Step 3: Wrap execute exits to force LLM closing or fail**

At every `return` in `runBuildExecutePhase`, if the run is ending and no final `assistant_text` with `final: true` was emitted, do NOT use fallback. Force the LLM to produce one or fail:

```ts
const CLOSING_SYSTEM_PROMPT =
  "Você deve terminar esta interação com uma frase curta para o usuário (máximo 200 caracteres) explicando o resultado real: o que conseguiu, o que falhou, ou por que parou. Não invente sucesso. Seja específico.";

async function forceFinalClosingOrFail(deps: BuildExecuteDeps, instruction: string, history: ChatMessage[]): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const nudgeResponse = await deps.llmChat(
      deps.executionModel,
      instruction,
      [...history, { role: "system", content: CLOSING_SYSTEM_PROMPT }],
      false,
    );
    const text = nudgeResponse?.content?.trim();
    if (text) {
      deps.narrationPhase.emitFinalClosing(text);
      return text;
    }
  }
  return null;
}
```

Use it at every early return. If it returns null, fail with:

```ts
const err = "O modelo não respondeu com a mensagem esperada.";
await deps.persistFinal(err, { lastFinishOk: false, buildFailed: true });
return { ok: false, error: err, ... };
```

For the final success path at the end of `runBuildExecutePhase`, already uses `resolveClosureText` and emits `assistant_text`. If `resolveClosureText` returns empty, call `forceFinalClosingOrFail` once.

- [ ] **Step 4: Apply same wrapping to plan-turn and chat-turn**

In `finishPlanModeFailure`, `finishPlanProposal`, `finishClarify`, and `finishChatFailure`, ensure the last emitted event is `assistant_text` with `final: true`. If the message is empty, call `forceFinalClosingOrFail` or fail with the technical error. In `finishPlanModeFailure`, do NOT use fallback strings.

- [ ] **Step 5: Verify tests pass**

Run: `deno test runtime/phases/execute.test.ts runtime/phases/plan-turn.test.ts runtime/phases/chat-turn.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/agent-run/runtime/phases/execute.ts supabase/functions/agent-run/runtime/phases/plan-turn.ts supabase/functions/agent-run/runtime/phases/chat-turn.ts supabase/functions/agent-run/runtime/phases/narration.ts supabase/functions/agent-run/runtime/phases/execute.test.ts

git commit -m "fix(phases): guarantee final assistant_text on every error/exit path"
```

---

## Task 4: Backend emits atomic tasks in build mode

**Files:**
- Modify: `supabase/functions/agent-run/tools/meta.ts:99-181`
- Modify: `supabase/functions/agent-run/runtime/phases/execute.ts:215-234, 440-448`
- Modify: `supabase/functions/agent-run/runtime/emitter.ts:128-...`
- Test: `supabase/functions/agent-run/tools/meta.test.ts` or `runtime/phases/execute.test.ts`

- [ ] **Step 1: Define `declare_tasks` tool**

Add to `tools/meta.ts`:

```ts
export const DECLARE_TASKS_TOOL: ToolDefinition = {
  name: "declare_tasks",
  description:
    "Declare the atomic tasks for this build. Call once before executing. " +
    "Each task must have a human label and an optional success criteria.",
  parameters: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            criteria: { type: "string" },
          },
          required: ["id", "label"],
        },
      },
    },
    required: ["tasks"],
  },
};
```

Include it in `mergeExecutionToolDefinitions` (not in plan mode).

- [ ] **Step 2: Detect `declare_tasks` in execute.ts**

After splitting meta tool calls (around line 372), handle `declare_tasks`:

```ts
const { clarify, createPlan, execution, declareTasks } = splitMetaToolCalls(response.tool_calls ?? []);
if (declareTasks) {
  const tasks = Array.isArray(declareTasks.arguments.tasks) ? declareTasks.arguments.tasks : [];
  for (const t of tasks) {
    deps.emit("task", {
      id: String(t.id ?? crypto.randomUUID()),
      label: String(t.label ?? ""),
      criteria: typeof t.criteria === "string" ? t.criteria : undefined,
      active: false,
      done: false,
    });
  }
  // mark as system message so loop continues
  deps.state.messages.push({ role: "assistant", content: "Tarefas declaradas." });
  continue;
}
```

- [ ] **Step 3: Map `task` in emitter**

In `RuntimeEmitter.onStream`, add:

```ts
if (type === "task") {
  const id = typeof d.id === "string" ? d.id : crypto.randomUUID();
  const label = typeof d.label === "string" ? d.label : "";
  if (label) {
    this.onStream({
      type: "task",
      data: {
        id,
        label,
        criteria: typeof d.criteria === "string" ? d.criteria : undefined,
        active: d.active === true,
        done: d.done === true,
        failed: d.failed === true,
      },
    });
  }
}
```

Also add `"task"` to `TIMELINE_EVENT_TYPES`.

- [ ] **Step 4: Activate task on first real work**

When a `tool_start` happens in execute, mark the first pending task as active:

```ts
const pendingTask = this.taskList.find((t) => !t.active && !t.done && !t.failed);
if (pendingTask) deps.emit("task", { ...pendingTask, active: true });
```

Use a simple in-memory `taskList` in `execute.ts` state.

- [ ] **Step 5: Verify with test**

Run: `deno test runtime/phases/execute.test.ts`
Expected: PASS with new `declare_tasks` test.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/agent-run/tools/meta.ts supabase/functions/agent-run/runtime/phases/execute.ts supabase/functions/agent-run/runtime/emitter.ts

git commit -m "feat(build): declare_tasks tool emits atomic task events"
```

---

## Task 5: Frontend reducer handles `task` event

**Files:**
- Modify: `src/lib/agent-progress.ts:423-...`
- Test: `src/lib/agent-progress.test.ts` (create if missing)

- [ ] **Step 1: Add `tasks` to AgentProgress**

```ts
export interface AgentProgress {
  ...
  tasks?: Array<{
    id: string;
    label: string;
    criteria?: string;
    status: "pending" | "active" | "done" | "failed";
  }>;
}
```

Initialize in `initialAgentProgress` as `[]`.

- [ ] **Step 2: Handle `task` event in applyAgentProgressEvent**

```ts
case "task": {
  const id = String(data.id ?? "");
  const label = String(data.label ?? "");
  if (!id || !label) return prev;
  const existing = prev.tasks ?? [];
  const idx = existing.findIndex((t) => t.id === id);
  const status: "pending" | "active" | "done" | "failed" = data.failed === true
    ? "failed"
    : data.done === true
      ? "done"
      : data.active === true
        ? "active"
        : "pending";
  const task = { id, label, criteria: typeof data.criteria === "string" ? data.criteria : undefined, status };
  const tasks = idx >= 0
    ? [...existing.slice(0, idx), task, ...existing.slice(idx + 1)]
    : [...existing, task];
  return { ...prev, tasks, timeline: [...prev.timeline, event] };
}
```

- [ ] **Step 3: Preserve final `assistant_text`**

In the `assistant_text` case, ensure `final: true` always sets `streamText`, never discards it:

```ts
const isFinal = data.final === true;
const skipStream = !isFinal && (narration || thinking || opening);
```

Change `skipStream = narration || thinking || opening;` to the above.

- [ ] **Step 4: Test**

Run: `npm test -- src/lib/agent-progress.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-progress.ts src/lib/agent-progress.test.ts

git commit -m "feat(progress): handle task event and preserve final assistant_text"
```

---

## Task 6: Frontend timeline maps `task` to `TASK`

**Files:**
- Modify: `src/lib/timeline-builder.ts:345-360`
- Test: `src/lib/timeline-builder.test.ts`

- [ ] **Step 1: Add handler for `task` event**

After the `plan_proposed` handler:

```ts
if (ev.type === "task") {
  const id = String(data.id ?? "");
  const label = typeof data.label === "string" ? data.label.trim() : "";
  if (id && label) {
    items.push({ type: "TASK", id: `task-${id}-${ts}`, label: truncate(label, 120) });
  }
  continue;
}
```

- [ ] **Step 2: Test**

Run: `npm test -- src/lib/timeline-builder.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/timeline-builder.ts src/lib/timeline-builder.test.ts

git commit -m "feat(timeline): map task event to TASK ForgeTimelineItem"
```

---

## Task 7: Frontend builds single live mini-card line

**Files:**
- Modify: `src/lib/forge-run.ts:211-271, 284-407, 474-516, 572-735`
- Modify: `src/lib/chat/types.ts:30-53`
- Test: `src/lib/forge-run.test.ts`

- [ ] **Step 1: Update MiniCardData type**

```ts
export type MiniCardData = {
  title: string;
  header: string;
  /** Single rotating live line — what the job is doing right now. */
  liveLine: string;
  status: MiniCardStatus;
  /** Activity stream reduced to a single live line (deprecated; kept for migration). */
  activity: ActivityLine[];
  /** Atomic task checklist. */
  tasks?: Array<{
    id: string;
    label: string;
    criteria?: string;
    status: "pending" | "active" | "done" | "failed";
  }>;
  editedFile?: string | null;
  fileCount?: number;
  hasPlan?: boolean;
  lastTool?: { name: string; path?: string; ok?: boolean } | null;
};
```

- [ ] **Step 2: Replace `collectMiniCardBriefings` with `collectMiniCardLiveLine`**

```ts
export function collectMiniCardLiveLine(
  progress: AgentProgress,
  timeline: ForgeTimelineItem[],
  jobActive: boolean,
): string {
  if (!jobActive) {
    // terminal snapshot line
    if (progress.lastFinishOk === false) return "Finalizado com falha";
    if (progress.diffs.length > 0) return `${progress.diffs.length} arquivo(s) alterado(s)`;
    if (progress.deliveryFiles?.length) return `${progress.deliveryFiles.length} arquivo(s) entregue(s)`;
    return "Concluído";
  }

  // pending tool = highest priority
  const pendingTool = [...progress.tools].reverse().find((t) => t.ok === undefined);
  if (pendingTool) {
    const path = pathFromArgs(pendingTool.args);
    const line = normalizeMiniCardBriefing(toolBriefing(pendingTool.name, path));
    if (line) return line;
  }

  // active task
  const activeTask = (progress.tasks ?? []).find((t) => t.status === "active");
  if (activeTask) return activeTask.label;

  // latest factual timeline item
  for (const item of [...timeline].reverse()) {
    const brief = timelineItemBriefing(item);
    if (brief) {
      const normalized = normalizeMiniCardBriefing(brief);
      if (normalized) return normalized;
    }
  }

  return "Trabalhando…";
}
```

- [ ] **Step 3: Simplify `collectMiniCardActivity`**

Keep it for backwards compatibility but return empty array when `liveLine` covers it. Or remove its usage in `buildAgentRunView` and set `activity: []`.

- [ ] **Step 4: Build tasks with criteria in `buildAgentRunView`**

```ts
const tasks = progress.tasks ?? (jobPlan?.steps ?? []).map((step, index) => ({
  id: step.id || `plan-step-${index}`,
  label: step.description,
  status: progress.finished
    ? progress.lastFinishOk === false ? "failed" : "done"
    : jobActive && index === 0 ? "active" : "pending",
  criteria: undefined,
}));
```

- [ ] **Step 5: Wire `liveLine` into miniCard**

In `buildAgentRunView`, replace `liveBriefings` usage with `liveLine: collectMiniCardLiveLine(...)`.

- [ ] **Step 6: Test**

Run: `npm test -- src/lib/forge-run.test.ts`
Expected: PASS after updating expectations.

- [ ] **Step 7: Commit**

```bash
git add src/lib/forge-run.ts src/lib/chat/types.ts src/lib/forge-run.test.ts

git commit -m "feat(forge-run): single live mini-card line + atomic task checklist"
```

---

## Task 8: Frontend renders widget mini-card

**Files:**
- Modify: `src/components/chat/ChatJobCard.tsx:78-295`
- Test: `src/lib/chat/turn-job-card.test.ts`

- [ ] **Step 1: Rewrite ChatJobCard for single live line + collapsible task list**

Remove the 5-line `forge-mini-card-activity` list. Render:

```tsx
export function ChatJobCard({ data, ... }) {
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const visibleTasks = tasksExpanded ? data.tasks : data.tasks?.slice(0, 4) ?? [];
  const hasMoreTasks = (data.tasks?.length ?? 0) > 4;

  return (
    <div className="forge-mini-card forge-mini-card-in-chat w-full" data-testid="chat-job-card" data-run-id={runId}>
      <button type="button" className="forge-mini-card-body" onClick={onClick}>
        <div className="forge-mini-card-live-header">
          <span className="forge-mini-card-live-dot" aria-hidden />
          <span className="forge-mini-card-live-badge">
            {isLive ? "Working" : isDone ? "Done" : isFailed ? "Failed" : "Working"}
          </span>
          <span className="forge-mini-card-live-line" data-testid="chat-mini-card-live-line">
            {data.liveLine}
          </span>
        </div>

        {data.tasks && data.tasks.length > 0 && (
          <ul className="forge-mini-card-task-list" data-testid="chat-mini-card-task-list">
            {visibleTasks.map((task) => (
              <li key={task.id} className={`forge-mini-card-task-item forge-mini-card-task-item--${task.status}`} data-status={task.status}>
                <span className="forge-mini-card-task-status" aria-hidden>{taskStatusIcon(task.status)}</span>
                <span className="forge-mini-card-task-label">{task.label}</span>
                {task.criteria && (
                  <span className="forge-mini-card-task-criteria">{task.criteria}</span>
                )}
              </li>
            ))}
            {hasMoreTasks && (
              <li>
                <button
                  type="button"
                  className="forge-mini-card-task-toggle"
                  onClick={(e) => { e.stopPropagation(); setTasksExpanded((v) => !v); }}
                  data-testid="chat-mini-card-task-toggle"
                >
                  {tasksExpanded ? "Ver menos" : `+${(data.tasks?.length ?? 0) - 4} tarefas`}
                </button>
              </li>
            )}
          </ul>
        )}

        {visibleChips.length > 0 && <div className="forge-mini-card-chips">...</div>}

        <p className="forge-mini-card-hint">{hint()}</p>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update tests**

Ensure tests expect `data-liveLine` instead of activity list.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatJobCard.tsx src/lib/chat/turn-job-card.test.ts src/styles/forge-inspector.css

git commit -m "feat(chat-job-card): render single live line and task checklist"
```

---

## Task 9: Enforce Lovable order in AssistantTurn + invariants

**Files:**
- Modify: `src/lib/chat/invariants.ts`
- Modify: `src/lib/chat/turn.ts`
- Modify: `src/components/chat/AssistantTurn.tsx`
- Test: `src/lib/chat/invariants.test.ts`, `src/lib/chat/assistant-turn-order.test.ts`

- [ ] **Step 1: Strengthen invariants**

```ts
export function enforceAssistantTurnInvariant(item): ThreadItem {
  let { streamText, narration, miniCard, thinking } = item;

  // closing prose only after job (mini-card) when active
  if (item.isActive && miniCard && streamText) streamText = null;

  // narration must exist if we have a mini-card and no thinking yet
  if (miniCard && !narration && !thinking) {
    narration = "Vou começar.";
  }

  // if active and no thinking, force thinking line so order is preserved
  if (item.isActive && !thinking) {
    thinking = { status: "active" };
  }

  return { ...item, streamText, narration, thinking };
}
```

- [ ] **Step 2: Update AssistantTurn to use enforced order**

Ensure render order remains: `ForgeThinking` → `ChatNarration` → `ChatJobCard` → closing. Already correct; add data-testid for order assertions.

- [ ] **Step 3: Verify tests**

Run: `npm test -- src/lib/chat/invariants.test.ts src/lib/chat/assistant-turn-order.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/chat/invariants.ts src/lib/chat/turn.ts src/components/chat/AssistantTurn.tsx src/lib/chat/invariants.test.ts src/lib/chat/assistant-turn-order.test.ts

git commit -m "fix(chat): enforce Lovable turn order with invariants"
```

---

## Task 10: Final validation and deploy

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: `✓ built in ...s`

- [ ] **Step 3: Frontend tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 4: Sync contract and typecheck edge**

```bash
npm run sync:agent-contract
cd supabase/functions/agent-run && deno check index.ts
```

Expected: no errors.

- [ ] **Step 5: Deploy edge function**

```bash
npx supabase functions deploy agent-run
```

Expected: `Deployed Functions on project ...: agent-run`

- [ ] **Step 6: Push frontend**

```bash
git push origin main
```

Expected: pushed, Vercel builds.

---

## Self-review

- **Spec coverage:**
  - Narração: Task 2, 5.
  - Fechamento: Task 3.
  - Mini-card widget: Tasks 7, 8.
  - Tarefas atômicas: Tasks 1, 4, 5, 6.
  - Ordem Lovable: Task 9.
- **Placeholder scan:** No TBD/TODO; all steps have exact file paths and code.
- **Type consistency:** `task` event uses `id`, `label`, `criteria`, `active`, `done`, `failed` consistently across contract, backend, reducer, timeline, forge-run, and chat types.
