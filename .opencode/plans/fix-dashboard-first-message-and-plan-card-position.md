# Fix Problems 1 & 2A: Dashboard First Message Trigger + Plan Card Positioning

## Problem 1: First message from dashboard doesn't trigger LLM

### Current state
- `PromptEngine.submit()` calls `createProjectFromPrompt` → creates project + conversation + 1 user message → navigates to editor
- Agent is NEVER triggered from the dashboard flow
- A `useEffect` auto-run was added to `useEditorAgentOrchestration.ts:107-117` which triggers the agent on any editor mount, but this wrongly re-triggers on F5

### Changes

#### 1a. Remove auto-run useEffect from `useEditorAgentOrchestration.ts`

**File**: `src/routes/projects/$projectId/useEditorAgentOrchestration.ts`

**Action**: Delete lines 107-117 entirely

```typescript
// DELETE this entire block:
const firstMessageAutoRunRef = useRef(false);

useEffect(() => {
  if (firstMessageAutoRunRef.current) return;
  if (!conversation?.id) return;
  if (agent.activeRunId != null) return;
  if (agentHasRun) return;

  firstMessageAutoRunRef.current = true;
  void runAgent();
}, [conversation?.id, agent.activeRunId, agentHasRun, runAgent]);
```

Also remove the unused `useRef` import if it becomes unused after this removal. Check first — `useRef` is still used on lines 86-93.

#### 1b. Add agent-trigger in `PromptEngine.submit()`

**File**: `src/components/prompt/PromptEngine.tsx`

**Action**: After `createProjectFromPrompt` succeeds (line 122, before `bootstrapComposerMode`), add a fire-and-forget Edge Function call to start the agent run.

Insert after line 122 (`const res = await createProject(...)`):

```typescript
if (projectKind === "app") {
  bootstrapComposerMode(res.projectId, "plan");
  // NEW: Trigger agent before navigation — fire-and-forget
  supabase.functions
    .invoke("agent-run", {
      body: {
        projectId: res.projectId,
        conversationId: res.conversationId,
        mode: "plan",
      },
    })
    .catch(() => {});
  warp.cancel();
  clearForgeTransitionOverlays();
  navigate({ to: "/projects/$projectId", params: { projectId: res.projectId } });
}
```

The existing `supabase` import is already present at line 6.

---

## Problem 2A: Plan card in wrong position (inside AssistantTurn)

### Current state
- When plan is approved/rejected, `handlePlanApprove` updates the plan assistant message meta with `planStatus: "approved"/"rejected"`
- `AssistantTurn.tsx` detects `planStatus` and renders a `.forge-plan-status-card` INSIDE the assistant turn, hiding the closing text
- This merges two chronological events (plan message → user approval) into one

### Changes

#### 2a. Revert AssistantTurn.tsx changes

**File**: `src/components/chat/AssistantTurn.tsx`

**Action**: (a) Remove `planStatus` useMemo, (b) restore `showClosing`, (c) remove plan card JSX

Remove lines 57-63 (planStatus useMemo):
```typescript
// DELETE:
const planStatus = useMemo(() => {
  const meta = item.message?.meta as Record<string, unknown> | undefined;
  if (!meta?.planId) return null;
  const ps = meta.planStatus;
  if (ps === "approved" || ps === "rejected") return ps;
  return null;
}, [item.message?.meta]);
```

Change line 70 (`showClosing`):
```typescript
// FROM:
const showClosing = !showClarify && !planStatus && !!closingText;
// TO:
const showClosing = !showClarify && !!closingText;
```

Remove lines 173-185 (planStatus card JSX):
```typescript
// DELETE entire block:
{planStatus && closingText && (
  <div className="forge-plan-status-card" data-testid="plan-status-card">
    <div className="forge-plan-status-header">
      <span className={`forge-plan-status-badge forge-plan-status-badge--${planStatus}`}>
        {planStatus === "approved" ? "Aprovado" : "Rejeitado"}
      </span>
      <span className="forge-plan-status-label">Plano</span>
    </div>
    <div className="forge-plan-status-body">
      <MarkdownRenderer variant="chat">{closingText}</MarkdownRenderer>
    </div>
  </div>
)}
```

#### 2b. Add `plan_status` kind to ThreadItem

**File**: `src/lib/chat/types.ts`

**Action**: Add `plan_status` variant to `ThreadItem` union type.

Add to imports (or inline):
```typescript
import type { PendingPlan } from "@/lib/agent-progress";
```

Add to `ThreadItem` type (after the assistant variant):
```typescript
export type ThreadItem =
  | { kind: "user"; message: ChatMessage }
  | {
      kind: "assistant";
      message?: ChatMessage;
      runId: string;
      isActive: boolean;
      streamText: string | null;
      phase?: RunPhase;
      phaseMessage?: string | null;
      narration?: string | null;
      miniCard?: MiniCardData | null;
      statusChips?: string[];
      clarify?: ClarifyPrompt | null;
      error?: string | null;
      finished?: boolean;
      lastFinishOk?: boolean;
      resumable?: boolean;
      isFocused?: boolean;
    }
  | {
      kind: "plan_status";
      status: "approved" | "rejected";
      plan: PendingPlan | null;
      message: ChatMessage;
    };
```

Also add `plan_status` to `RawThreadItem`:
```typescript
export type RawThreadItem =
  | { kind: "user"; message: ChatMessage; internal?: boolean }
  | {
      kind: "assistant";
      message?: ChatMessage;
      runId?: string;
      isActive: boolean;
      live?: AgentProgress;
    }
  | {
      kind: "plan_status";
      status: "approved" | "rejected";
      message: ChatMessage;
    };
```

#### 2c. Inject plan_status items in `thread.ts`

**File**: `src/lib/chat/thread.ts`

**Action 1**: In `buildDbThread`, after the assistant push (lines 138-145), check for `planStatus` in message meta and inject a `plan_status` raw item.

After the `else` branch that ends with:
```typescript
} else {
  items.push({
    kind: "assistant",
    message: msg,
    runId,
    isActive: false,
  });
}
```

Add:
```typescript
  const meta = msg.meta as Record<string, unknown> | undefined;
  if (meta?.planStatus === "approved" || meta?.planStatus === "rejected") {
    items.push({
      kind: "plan_status",
      status: meta.planStatus,
      message: msg,
    });
  }
```

**Action 2**: In `buildChatThread` flatMap (lines 357-373), handle `plan_status` kind. Since we need `storedPlanFromMessage`, add import at top:

```typescript
import { storedPlanFromMessage } from "@/lib/plan-message-meta";
```

Inside the flatMap callback, add before the `return [mapAssistantTurn(...)]` line:

```typescript
    if (item.kind === "plan_status") {
      const stored = storedPlanFromMessage(item.message);
      return [{
        kind: "plan_status",
        status: item.status,
        plan: stored?.plan ?? null,
        message: item.message,
      }];
    }
```

#### 2d. Handle plan_status in `ChatMessage.tsx`

**File**: `src/components/chat/ChatMessage.tsx`

**Action**: Add handling for `kind === "plan_status"` before the assistant branch.

Add import for `ChatPlanDock` at top:
```typescript
import { ChatPlanDock } from "./ChatPlanDock";
```

In the component body, add a new branch before the existing `// Handle assistant` logic:

```typescript
  if (item.kind === "plan_status") {
    return (
      <article className="forge-chat-item forge-chat-item-plan-status" data-testid="chat-plan-status">
        <ChatPlanDock
          pendingPlan={item.plan}
          creating={false}
          status={item.status}
          onReview={(runId) => onOpenInspector?.(runId, "plan")}
        />
      </article>
    );
  }
```

The existing `if (item.kind === "user")` handles user, now this new `if (item.kind === "plan_status")` handles plan_status, and the remaining code handles assistant.

#### 2e. Add status prop to `ChatPlanDock.tsx` for read-only mode

**File**: `src/components/chat/ChatPlanDock.tsx`

**Action**: Add optional `status` prop and render read-only mode.

Add to props type:
```typescript
export type ChatPlanDockProps = {
  pendingPlan: PendingPlan | null;
  creating: boolean;
  onReview?: (runId: string) => void;
  onApprove?: (steps: PlanStep[], markdown?: string) => void | Promise<void>;
  onReject?: (reason?: string) => void | Promise<void>;
  /** When set, renders in read-only mode showing plan status (approved/rejected) */
  status?: "approved" | "rejected";
};
```

Update destructuring:
```typescript
export function ChatPlanDock({
  pendingPlan,
  creating,
  onReview,
  onApprove,
  onReject,
  status,
}: ChatPlanDockProps) {
```

**For the read-only mode rendering**, add a new check after the `creating` check and before the `if (!pendingPlan) return null`:

After the "creating" block (lines 56-67), add:
```typescript
  if (status) {
    const body = planParagraphFromPlan(pendingPlan);
    return (
      <div className="forge-plan-dock" data-testid="chat-plan-status-readonly">
        <div className="forge-plan-status-card">
          <div className="forge-plan-status-header">
            <span className={`forge-plan-status-badge forge-plan-status-badge--${status}`}>
              {status === "approved" ? "Aprovado" : "Rejeitado"}
            </span>
            <span className="forge-plan-status-label">Plano</span>
          </div>
          <div className="forge-plan-dock-inner">
            <p className="forge-plan-dock-body">{body}</p>
          </div>
          {onReview && pendingPlan && (
            <div className="forge-composer-row">
              <div className="forge-composer-row-start">
                <button
                  type="button"
                  className="forge-plan-dock-btn"
                  onClick={() => onReview(pendingPlan.runId)}
                >
                  Review
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
```

This reuses the existing `.forge-plan-status-card*` CSS styles (which were written for the old Problem 2A fix) and the existing `.forge-plan-dock-inner` / `.forge-plan-dock-body` / `.forge-composer-row` styles.

#### 2f. Handle plan_status keys in `ChatThread.tsx`

**File**: `src/components/chat/ChatThread.tsx`

**Action**: Add `plan_status` branch to key generation logic.

Change the key logic (lines 27-30):
```typescript
const key =
  item.kind === "user"
    ? `user-${item.message.id}`
    : item.kind === "plan_status"
      ? `plan-status-${item.message.id}`
      : `assistant-${item.runId ?? item.message?.id ?? `fallback-${index}`}`;
```

---

## Verification

After making all changes, run:
```bash
npm run typecheck
npm run lint
```

Check the thread test file at `src/lib/chat/thread.test.ts` — the existing test `"oculta mensagem plan_approved do chat mas ancora build run"` should still pass. The plan_status card won't appear in that test because `buildChatThread` is tested with specific mock data, but the test's `messages` don't have `planStatus` set on the assistant message. Verify:
- Thread still correctly hides plan_approved user messages
- Thread still correctly shows user → assistant → plan_status → (hidden user) → assistant order

Manual testing:
1. Dashboard: type prompt → submit → verify navigation to editor AND agent starts (check inspector or network tab for `agent-run` call)
2. F5 in editor → verify agent does NOT auto-start (no duplicate run)
3. Create a project, let the agent generate a plan, approve it → verify plan status card appears in thread AFTER the plan message with "Aprovado" badge + Review button
4. Verify the plan message's original closing text is preserved and visible
