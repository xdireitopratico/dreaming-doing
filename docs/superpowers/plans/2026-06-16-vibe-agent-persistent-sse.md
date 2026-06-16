# Vibe Agent Persistent SSE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory Vibe Agent stream registry with a Supabase-backed persistent event log and DB-driven SSE replay for both chat and inspector streams.

**Architecture:** `POST /execute` creates an `agent_executions` row and returns an `execution_id`. The agent loop persists every chat and inspector event to `vibe_agent_events`. `GET /stream/chat` and `GET /stream/inspector` stream persisted events from Supabase with cursor replay and optional polling until `session_end` or terminal error.

**Tech Stack:** Deno Edge Function, Supabase PostgREST client, SSE, Vitest, TypeScript.

---

### Task 1: Add persistent event persistence in the agent loop

**Files:**
- Modify: `supabase/functions/_shared/agent-loop.ts`
- Test: `supabase/functions/_shared/agent-loop.test.ts` or equivalent Deno test

- [ ] **Step 1: Write failing test for persistent event persistence**

```ts
import { describe, it, expect, vi } from 'vitest';
import { executeAgentLoop } from './agent-loop';

describe('agent-loop persistent events', () => {
  it('persists chat and inspector events with execution metadata', async () => {
    const insert = vi.fn().mockResolvedValue({});
    const sb = { from: vi.fn().mockReturnThis(), insert, select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }), update: vi.fn().mockReturnThis() };
    vi.doMock('./prometheus-db.ts', () => ({ supabaseAdmin: () => sb }));

    await executeAgentLoop({
      conversationId: 'conversation-id',
      userMessage: 'test',
      userId: 'system',
      chatWriter: { write: vi.fn(), close: vi.fn() },
      inspectorWriter: { write: vi.fn(), close: vi.fn() },
      requestId: 'request-id',
      sessionId: 'session-id',
    } as any);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ channel: expect.any(String) }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run supabase/functions/_shared/agent-loop.test.ts
```

Expected: FAIL because chat events are not persisted yet.

- [ ] **Step 3: Implement minimal persistence**

Modify `executeAgentLoop` so both `emitChat` and `emitInspector` call a shared `persistEvent(sb, ctx, channel, event)` that inserts into `vibe_agent_events` with:
- `execution_id`
- `conversation_id`
- `request_id`
- `channel`
- `event_type`
- `event_data`
- `sequence`

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run supabase/functions/_shared/agent-loop.test.ts
```

Expected: PASS.

---

### Task 2: Replace in-memory stream registry with DB-backed SSE endpoints

**Files:**
- Modify: `supabase/functions/vibe-agent-chat/index.ts`
- Modify: `supabase/functions/_shared/vibe-agent-events.ts` if cursor/event row types need alignment

- [ ] **Step 1: Write failing test for stream endpoint behavior**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createPersistentSseResponse } from './index';

describe('persistent SSE', () => {
  it('streams persisted chat events from Supabase', async () => {
    const select = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [{ event_data: { type: 'chat_intro', text: 'hello' } }], error: null });
    const sb = { from: vi.fn().mockReturnThis(), select, eq, order, limit };

    const response = await createPersistentSseResponse(sb, 'chat', 'execution-id', undefined, vi.fn());
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run supabase/functions/vibe-agent-chat/index.test.ts
```

Expected: FAIL because endpoint currently reads from `streamRegistry`.

- [ ] **Step 3: Implement DB-backed SSE helper**

Add helpers in `index.ts`:
- `createPersistentSseResponse(sb, channel, executionId, cursor?, signal?)`
- `fetchEventsSinceCursor(sb, channel, executionId, cursor)`
- `encodeSSE(event)`
- `sleep(ms)`

The helper should:
1. fetch existing persisted events ordered by `sequence, created_at`
2. send each event as `data: <json>\n\n`
3. send a `checkpoint` event with cursor
4. stop when `session_end`, `chat_closure`, or `chat_error` is reached
5. otherwise poll every 750ms until timeout

- [ ] **Step 4: Update `/stream/chat` and `/stream/inspector` routes**

They should:
- accept `execution_id` or `stream_id`
- ignore `stream_id` fallback only for backward compatibility
- call `createPersistentSseResponse`
- never read from `streamRegistry`

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run supabase/functions/vibe-agent-chat/index.test.ts
```

Expected: PASS.

---

### Task 3: Update client core to use execution IDs and persistent streams

**Files:**
- Modify: `src/lib/vibe-agent-core.ts`
- Modify: `src/hooks/useVibeChat.ts`
- Modify: `src/hooks/useVibeInspector.ts`

- [ ] **Step 1: Write failing test for client stream subscription**

```ts
import { describe, it, expect, vi } from 'vitest';
import { VibeAgentCore } from './vibe-agent-core';

describe('VibeAgentCore persistent streams', () => {
  it('subscribes to chat using execution_id', async () => {
    const core = new VibeAgentCore();
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ execution_id: 'exec-1' }) })
      .mockResolvedValueOnce({ ok: true, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"type":"chat_intro","text":"hello"}\n\n')); c.close(); } }) });

    const { chatStream } = await core.sendMessage('conversation-id', 'hello');
    const first = await chatStream.next();

    expect(first.value.type).toBe('chat_intro');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/vibe-agent-core.test.ts
```

Expected: FAIL because client still expects `chat_stream_id`.

- [ ] **Step 3: Update `sendMessage` return contract**

Return:
```ts
{
  executionId: string;
  chatStream: AsyncIterable<ChatEvent>;
  inspectorStream: AsyncIterable<InspectorEvent>;
}
```

- [ ] **Step 4: Update `subscribeChat` and `subscribeInspector` query params**

Use `execution_id` instead of `stream_id`.

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/lib/vibe-agent-core.test.ts
```

Expected: PASS.

---

### Task 4: Add E2E smoke tests for persistent event flow

**Files:**
- Create: `tests/vibe-agent-persistent-sse.e2e.test.ts`

- [ ] **Step 1: Write E2E smoke test skeleton**

```ts
import { describe, it, expect } from 'vitest';

describe('Vibe Agent persistent SSE e2e', () => {
  it('persists chat and inspector events and replays them from DB', async () => {
    // Use Supabase client with service role key from env
    // 1. Create conversation
    // 2. POST /execute
    // 3. GET /stream/chat?execution_id=...
    // 4. GET /stream/inspector?execution_id=...
    // 5. Assert at least one persisted chat event and one persisted inspector event exist
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/vibe-agent-persistent-sse.e2e.test.ts
```

Expected: FAIL until backend is deployed.

- [ ] **Step 3: Deploy migrations and function**

```bash
supabase db push
supabase functions deploy vibe-agent-chat --no-verify-jwt
```

- [ ] **Step 4: Run E2E test again**

```bash
npx vitest run tests/vibe-agent-persistent-sse.e2e.test.ts
```

Expected: PASS if deployed environment is reachable.

---

### Task 5: Validate and commit

- [ ] **Step 1: Run TypeScript validation**

```bash
npx tsc --noEmit
```

Expected: no new errors in Vibe Agent files.

- [ ] **Step 2: Run Deno validation**

```bash
deno check supabase/functions/vibe-agent-chat/index.ts supabase/functions/_shared/agent-loop.ts
```

Expected: no errors in touched files.

- [ ] **Step 3: Run unit tests**

```bash
npx vitest run src/lib/vibe-agent-core.test.ts tests/vibe-agent-persistent-sse.e2e.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/agent-loop.ts supabase/functions/vibe-agent-chat/index.ts src/lib/vibe-agent-core.ts src/hooks/useVibeChat.ts src/hooks/useVibeInspector.ts src/lib/vibe-agent-core.test.ts tests/vibe-agent-persistent-sse.e2e.test.ts
git commit -m "fix(vibe-agent): make chat and inspector streams persistent"
git push origin main
```
