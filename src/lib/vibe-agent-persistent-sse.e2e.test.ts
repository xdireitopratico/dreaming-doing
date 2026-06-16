import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

const enabled = Boolean(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.VIBE_AGENT_E2E === '1',
);

const controllers: AbortController[] = [];

describe.runIf(enabled)('Vibe Agent persistent SSE e2e', () => {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const edgeBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/vibe-agent-chat`;
  const sb = createClient(supabaseUrl, serviceRoleKey);
  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.abort());
  });

  it('persists chat and inspector events and streams them from Supabase', async () => {
    const flow = await firstFlow(sb);
    const conversation = await createConversation(edgeBase, serviceRoleKey, flow.id);
    const execution = await executeMessage(edgeBase, serviceRoleKey, conversation.id);

    const rows = await waitForEvents(sb, execution.execution_id, 30_000);
    expect(rows.chat.length).toBeGreaterThan(0);
    expect(rows.inspector.length).toBeGreaterThan(0);
    expect(rows.chat.some((row: any) => row.event_type === 'chat_intro' || row.event_type === 'chat_loop_step')).toBe(true);
    expect(rows.inspector.some((row: any) => row.event_type === 'session_start' || row.event_type === 'thinking' || row.event_type === 'tool_call')).toBe(true);

    await expectFirstSseFrame(edgeBase, serviceRoleKey, 'chat', execution.execution_id);
    await expectFirstSseFrame(edgeBase, serviceRoleKey, 'inspector', execution.execution_id);
  }, 60_000);
});

describe.skipIf(enabled)('Vibe Agent persistent SSE e2e skipped', () => {
  it('skips when SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and VIBE_AGENT_E2E=1 are not set', () => {
    expect(true).toBe(true);
  });
});

async function firstFlow(sb: SupabaseClient): Promise<{ id: string }> {
  const { data, error } = await sb.from('agent_flows').select('id').limit(1).single();
  if (error || !data) throw new Error(`Failed to load flow: ${error?.message || 'no flow'}`);
  return data as { id: string };
}

async function createConversation(edgeBase: string, serviceRoleKey: string, flowId: string): Promise<{ id: string }> {
  const response = await fetch(`${edgeBase}/conversations`, {
    method: 'POST',
    headers: authHeaders(serviceRoleKey),
    body: JSON.stringify({ flow_id: flowId }),
  });
  const text = await response.text();
  expect(response.ok, text).toBe(true);
  return JSON.parse(text) as { id: string };
}

async function executeMessage(edgeBase: string, serviceRoleKey: string, conversationId: string): Promise<{ execution_id: string }> {
  const response = await fetch(`${edgeBase}/execute`, {
    method: 'POST',
    headers: authHeaders(serviceRoleKey),
    body: JSON.stringify({
      conversation_id: conversationId,
      message: 'teste persistente de SSE',
    }),
  });
  const text = await response.text();
  expect(response.ok, text).toBe(true);
  return JSON.parse(text) as { execution_id: string };
}

async function waitForEvents(
  sb: SupabaseClient,
  executionId: string,
  timeoutMs: number,
): Promise<{ chat: unknown[]; inspector: unknown[] }> {
  const deadline = Date.now() + timeoutMs;
  let chat: unknown[] = [];
  let inspector: unknown[] = [];

  while (Date.now() < deadline) {
    const { data, error } = await sb
      .from('vibe_agent_events')
      .select('id, channel, event_type, event_data')
      .eq('execution_id', executionId);

    if (!error && data) {
      chat = data.filter((row: any) => row.channel === 'chat');
      inspector = data.filter((row: any) => row.channel === 'inspector');
      if (chat.length > 0 && inspector.length > 0) return { chat, inspector };
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  return { chat, inspector };
}

async function expectFirstSseFrame(
  edgeBase: string,
  serviceRoleKey: string,
  channel: 'chat' | 'inspector',
  executionId: string,
): Promise<void> {
  const controller = new AbortController();
  controllers.push(controller);
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(`${edgeBase}/stream/${channel}?execution_id=${executionId}`, {
      headers: {
        ...authHeaders(serviceRoleKey),
        Accept: 'text/event-stream',
      },
      signal: controller.signal,
    });
    expect(response.ok, await response.text()).toBe(true);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.body).toBeTruthy();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (buffer.length < 20) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes('data:')) break;
    }

    expect(buffer).toContain('data:');
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function authHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}
