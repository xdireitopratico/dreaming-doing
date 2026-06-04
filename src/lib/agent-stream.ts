// agent-stream.ts — Lê o SSE da Edge Function agent-run.
// Cada evento `data: {…}\n\n` vira um item no callback.
import { supabase } from "@/integrations/supabase/client";
import { loadAgentPreferences } from "@/lib/agent-preferences";

export type AgentEvent =
  | { type: "start"; projectId: string; conversationId: string; provider?: string }
  | { type: "phase"; data: { phase: string; message?: string; toolCount?: number; intent?: unknown } }
  | { type: "classify"; data: { complexity: number; model: string; summary: string } }
  | { type: "skills"; data: { active: string[] } }
  | { type: "tool_start"; data: { name: string; args: unknown } }
  | { type: "tool_done"; data: { name: string; ok: boolean; error?: string } }
  | { type: "validate_fail"; data: { attempt: number; checks: string[]; feedback?: string } }
  | { type: "validate_ok"; data: { message: string } }
  | { type: "done"; data: { summary: string } }
  | { type: "finish"; ok: boolean; summary?: string; error?: string; steps?: number }
  | { type: "error"; error?: string; data?: { message?: string } };

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export async function streamAgentRun(
  args: { projectId: string; conversationId: string; signal?: AbortSignal },
  onEvent: (ev: AgentEvent) => void,
): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Faça login.");

  const resp = await fetch(`${FUNCTIONS_URL}/agent-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
      "Authorization": `Bearer ${token}`,
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      projectId: args.projectId,
      conversationId: args.conversationId,
      preferences: loadAgentPreferences(),
    }),
    signal: args.signal,
  });

  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`agent-run ${resp.status}: ${txt.slice(0, 300)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      if (!chunk.startsWith("data:")) continue;
      const json = chunk.slice(5).trim();
      try {
        const ev = JSON.parse(json) as AgentEvent;
        onEvent(ev);
      } catch {
        // ignora linhas mal-formadas
      }
    }
  }
}
