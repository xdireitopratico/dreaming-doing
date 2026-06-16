/**
 * prometheus-db.ts — Shared DB infrastructure for Prometheus Builder
 * Singleton admin client, turn persistence, phase updates, shared helpers.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

// ═══ PROMPT SANITIZATION (anti-injection) ═══

const MAX_USER_INPUT_LENGTH = 10_000;

/**
 * Sanitize user-supplied text before embedding in LLM prompts.
 * Uses XML-style delimiters so the model treats the content as data, not instructions.
 */
export function sanitizeForPrompt(input: string): string {
  const truncated = input.length > MAX_USER_INPUT_LENGTH
    ? input.slice(0, MAX_USER_INPUT_LENGTH) + "...(truncado)"
    : input;
  // Strip sequences that could close our delimiter or inject system-level instructions
  return truncated
    .replace(/<\/?user_input>/gi, "")
    .replace(/<\/?system>/gi, "");
}

/**
 * Wrap user input in XML delimiters for safe embedding in prompts.
 */
export function wrapUserInput(input: string): string {
  return `<user_input>\n${sanitizeForPrompt(input)}\n</user_input>`;
}

// ═══ DISPLAY NAMES (shared across all modules) ═══

export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  cortex: "Cortex — Orquestrador",
  analyst: "Analyst — Requisitos",
  architect: "Architect — Arquitetura",
  secretary: "Secretária — Vibe Agent",
  scribe: "Scribe — Prompts",
  sentinel: "Sentinel — Testes",
  user: "Você",
};

// ═══ ADMIN CLIENT SINGLETON ═══
// BUG 109 FIX: Cache admin client singleton (Deno edge functions are long-lived)

let _adminClient: ReturnType<typeof createClient> | null = null;

export function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _adminClient;
}

export type SupabaseAdmin = ReturnType<typeof supabaseAdmin>;

// ═══ TURN PERSISTENCE ═══

export async function insertTurn(
  sb: SupabaseAdmin,
  sessionId: string,
  agentKey: string,
  content: string,
  messageType: string,
  phase: string,
  round: number,
  outputData?: Record<string, unknown> | null,
) {
  const { error } = await (sb.from("prometheus_build_turns" as any) as any).insert({
    session_id: sessionId,
    agent_key: agentKey,
    agent_display: AGENT_DISPLAY_NAMES[agentKey] || agentKey,
    content,
    message_type: messageType,
    round,
    output_data: outputData || null,
    phase,
  });
  if (error) console.error("[prometheus-db] Failed to insert turn:", error.message);
}

// ═══ TOKEN TRACKING ═══

export async function persistTokensUsed(
  sb: SupabaseAdmin,
  sessionId: string,
  tokensUsed: number,
) {
  if (tokensUsed <= 0) return;
  const { error } = await (sb.from("prometheus_build_sessions" as any) as any)
    .update({ tokens_used: tokensUsed })
    .eq("id", sessionId);
  if (error) {
    console.error(`[prometheus-db] Failed to persist tokens_used=${tokensUsed} for session ${sessionId}:`, error.message);
  }
}

export function researchCacheHasResults(cache: Record<string, unknown>): boolean {
  for (const v of Object.values(cache)) {
    const entry = v as { result?: { results_count?: number; count?: number; word_count?: number } };
    const r = entry?.result;
    if (!r) continue;
    const hits = r.results_count ?? r.count ?? (r.word_count && r.word_count > 0 ? 1 : 0);
    if (typeof hits === "number" && hits > 0) return true;
  }
  return false;
}

export async function persistResearchCache(
  sb: SupabaseAdmin,
  sessionId: string,
  researchCache: Record<string, unknown>,
) {
  if (!sessionId || Object.keys(researchCache).length === 0) return;
  const { error } = await (sb.from("prometheus_build_sessions" as any) as any)
    .update({ research_cache: researchCache })
    .eq("id", sessionId);
  if (error) {
    console.error(`[prometheus-db] Failed to persist research_cache for ${sessionId}:`, error.message);
  }
}

// ═══ SESSION PHASE UPDATE ═══

export async function updateSessionPhase(
  sb: SupabaseAdmin,
  sessionId: string,
  phase: string,
  extra?: Record<string, unknown>,
) {
  const update: Record<string, unknown> = { phase, ...extra };
  await (sb.from("prometheus_build_sessions" as any) as any).update(update).eq("id", sessionId);
}

// ═══ MODEL RESOLUTION ═══

export function getModelId(session: any): string {
  const modelId = session.quality_model;
  if (!modelId) {
    throw new Error("[prometheus-db] FATAL: No quality_model in session — user must select a model in the power selector");
  }
  return modelId;
}
