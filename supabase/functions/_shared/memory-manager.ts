import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * AetherForge Memory Manager — Round 42
 * 
 * 3 scopes:
 *   - short_term: Contexto da conversa atual, TTL 1h (Postgres-backed)
 *   - long_term: Fatos permanentes do usuário/tenant, sem TTL
 *   - episodic: Resumos de sessões anteriores, TTL 30 dias
 */

export type MemoryScope = "short_term" | "long_term" | "episodic";

export interface MemoryEntry {
  key: string;
  value: any;
  scope: MemoryScope;
  importance_score?: number;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  expires_at?: string | null;
  access_count?: number;
}

export interface MemoryRequest {
  flow_id: string;
  session_id: string;
  operation: "read" | "write" | "delete" | "list" | "summarize";
  key?: string;
  value?: any;
  scope?: MemoryScope;
  ttl_seconds?: number;
  importance_score?: number;
  metadata?: Record<string, any>;
}

export interface MemoryResult {
  operation: string;
  success: boolean;
  key?: string;
  value?: any;
  scope?: MemoryScope;
  entries?: MemoryEntry[];
  error?: string;
}

const DEFAULT_TTL: Record<MemoryScope, number | null> = {
  short_term: 3600,       // 1 hour
  long_term: null,         // never
  episodic: 30 * 86400,   // 30 days
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Execute a memory operation
 */
export async function executeMemory(req: MemoryRequest): Promise<MemoryResult> {
  const scope = req.scope || "short_term";

  switch (req.operation) {
    case "read":
      return memoryRead(req.flow_id, req.session_id, req.key!, scope);
    case "write":
      return memoryWrite(req.flow_id, req.session_id, req.key!, req.value, scope, req.ttl_seconds, req.importance_score, req.metadata);
    case "delete":
      return memoryDelete(req.flow_id, req.session_id, req.key!, scope);
    case "list":
      return memoryList(req.flow_id, req.session_id, scope);
    case "summarize":
      return memorySummarize(req.flow_id, req.session_id);
    default:
      return { operation: req.operation, success: false, error: `Unknown operation: ${req.operation}` };
  }
}

async function memoryRead(flowId: string, sessionId: string, key: string, scope: MemoryScope): Promise<MemoryResult> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("agent_memory")
    .select("key, value, scope, importance_score, metadata, created_at, updated_at, expires_at, access_count")
    .eq("flow_id", flowId)
    .eq("session_id", sessionId)
    .eq("key", key)
    .eq("scope", scope)
    .single();

  if (error || !data) {
    return { operation: "read", success: false, key, scope, value: null };
  }

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    await supabase.from("agent_memory").delete().eq("flow_id", flowId).eq("session_id", sessionId).eq("key", key).eq("scope", scope);
    return { operation: "read", success: false, key, scope, value: null };
  }

  // Update access count
  await supabase
    .from("agent_memory")
    .update({ access_count: (data.access_count || 0) + 1, last_accessed_at: new Date().toISOString() })
    .eq("flow_id", flowId).eq("session_id", sessionId).eq("key", key).eq("scope", scope);

  return { operation: "read", success: true, key, scope, value: data.value };
}

async function memoryWrite(
  flowId: string, sessionId: string, key: string, value: any,
  scope: MemoryScope, ttlSeconds?: number, importanceScore?: number, metadata?: Record<string, any>
): Promise<MemoryResult> {
  const supabase = getSupabase();

  const ttl = ttlSeconds ?? DEFAULT_TTL[scope];
  const expiresAt = ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null;

  const { error } = await supabase
    .from("agent_memory")
    .upsert({
      flow_id: flowId,
      session_id: sessionId,
      key,
      scope,
      value: typeof value === "object" ? value : { data: value },
      importance_score: importanceScore ?? 0.5,
      metadata: metadata || {},
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "flow_id,session_id,key,scope" });

  if (error) {
    console.error("[Memory] Write error:", error.message);
    return { operation: "write", success: false, key, scope, error: error.message };
  }

  return { operation: "write", success: true, key, scope, value };
}

async function memoryDelete(flowId: string, sessionId: string, key: string, scope: MemoryScope): Promise<MemoryResult> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("agent_memory")
    .delete()
    .eq("flow_id", flowId)
    .eq("session_id", sessionId)
    .eq("key", key)
    .eq("scope", scope);

  return { operation: "delete", success: !error, key, scope, error: error?.message };
}

async function memoryList(flowId: string, sessionId: string, scope: MemoryScope): Promise<MemoryResult> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("agent_memory")
    .select("key, value, scope, importance_score, metadata, created_at, updated_at, expires_at, access_count")
    .eq("flow_id", flowId)
    .eq("session_id", sessionId)
    .eq("scope", scope)
    .order("importance_score", { ascending: false })
    .limit(50);

  if (error) {
    return { operation: "list", success: false, scope, error: error.message };
  }

  // Filter expired
  const now = new Date();
  const valid = (data || []).filter((d: any) => !d.expires_at || new Date(d.expires_at) > now);

  return { operation: "list", success: true, scope, entries: valid as MemoryEntry[] };
}

/**
 * Summarize all memory scopes for context injection
 */
async function memorySummarize(flowId: string, sessionId: string): Promise<MemoryResult> {
  const supabase = getSupabase();
  const now = new Date();

  const { data } = await supabase
    .from("agent_memory")
    .select("key, value, scope, importance_score")
    .eq("flow_id", flowId)
    .eq("session_id", sessionId)
    .order("importance_score", { ascending: false })
    .limit(100);

  const valid = (data || []).filter((d: any) => !d.expires_at || new Date(d.expires_at) > now);

  const grouped: Record<string, any[]> = { short_term: [], long_term: [], episodic: [] };
  for (const entry of valid) {
    if (grouped[entry.scope]) grouped[entry.scope].push(entry);
  }

  return {
    operation: "summarize",
    success: true,
    value: {
      short_term: grouped.short_term.map((e: any) => ({ [e.key]: e.value })),
      long_term: grouped.long_term.map((e: any) => ({ [e.key]: e.value })),
      episodic: grouped.episodic.map((e: any) => ({ [e.key]: e.value })),
      total_entries: valid.length,
    },
  };
}
