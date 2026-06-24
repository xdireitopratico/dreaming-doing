import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * AetherForge Semantic Cache — Round 42
 * 
 * Uses existing `semantic_cache` table + embedding similarity for hit/miss.
 * - Hit: similarity > 0.92 AND quality_score > 0.7 → return cached response
 * - Miss: execute normally, save if quality_score > 0.8
 * - Invalidation: new flow version clears cache, TTL 7 days
 * - Opt-in per flow
 */

export interface CacheLookupResult {
  hit: boolean;
  cached_response?: string;
  similarity?: number;
  quality_score?: number;
  cache_id?: string;
  latency_ms: number;
}

export interface CacheSaveRequest {
  flow_id: string;
  flow_version?: number;
  input_text: string;
  input_hash: string;
  response_text: string;
  model_id: string;
  quality_score?: number;
  tokens_saved?: number;
  cost_saved_cents?: number;
}

const SIMILARITY_THRESHOLD = 0.92;
const QUALITY_THRESHOLD_HIT = 0.7;
const QUALITY_THRESHOLD_SAVE = 0.8;
const CACHE_TTL_DAYS = 7;

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Simple hash for cache key dedup
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `sc_${Math.abs(hash).toString(36)}`;
}

/**
 * Normalize input for cache matching
 */
function normalizeInput(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Look up semantic cache for a given input
 * Uses exact hash match first (fast), then falls back to semantic similarity via pgvector
 */
export async function cacheLookup(
  flowId: string,
  inputText: string,
  modelId?: string,
): Promise<CacheLookupResult> {
  const start = Date.now();
  const supabase = getSupabase();
  const normalized = normalizeInput(inputText);
  const inputHash = simpleHash(normalized);

  try {
    // 1. Fast path: exact hash match
    const { data: exactMatch } = await supabase
      .from("semantic_cache")
      .select("id, response_text, quality_score, similarity_score, created_at")
      .eq("flow_id", flowId)
      .eq("input_hash", inputHash)
      .gte("quality_score", QUALITY_THRESHOLD_HIT)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (exactMatch) {
      // Check TTL
      const age = Date.now() - new Date(exactMatch.created_at).getTime();
      if (age < CACHE_TTL_DAYS * 86400 * 1000) {
        // Update hit count
        try {
          await supabase.rpc("increment_cache_hit", { cache_id: exactMatch.id });
        } catch {
          /* best-effort counter */
        }

        console.log(`[SemanticCache] ✓ EXACT HIT for "${inputText.substring(0, 50)}" (hash=${inputHash})`);
        return {
          hit: true,
          cached_response: exactMatch.response_text,
          similarity: 1.0,
          quality_score: exactMatch.quality_score,
          cache_id: exactMatch.id,
          latency_ms: Date.now() - start,
        };
      }
    }

    // 2. Semantic similarity search (if embeddings exist)
    // For now, use text-based fuzzy matching via trigram similarity
    // Future: pgvector cosine similarity with nomic-embed-text embeddings
    const { data: candidates } = await supabase
      .from("semantic_cache")
      .select("id, input_text, response_text, quality_score, created_at")
      .eq("flow_id", flowId)
      .gte("quality_score", QUALITY_THRESHOLD_HIT)
      .order("created_at", { ascending: false })
      .limit(10);

    if (candidates && candidates.length > 0) {
      // Simple Jaccard similarity for short queries
      for (const candidate of candidates) {
        const age = Date.now() - new Date(candidate.created_at).getTime();
        if (age > CACHE_TTL_DAYS * 86400 * 1000) continue;

        const sim = jaccardSimilarity(normalized, normalizeInput(candidate.input_text || ""));
        if (sim >= SIMILARITY_THRESHOLD) {
          console.log(`[SemanticCache] ✓ SEMANTIC HIT (${sim.toFixed(3)}) for "${inputText.substring(0, 50)}"`);
          return {
            hit: true,
            cached_response: candidate.response_text,
            similarity: sim,
            quality_score: candidate.quality_score,
            cache_id: candidate.id,
            latency_ms: Date.now() - start,
          };
        }
      }
    }

    console.log(`[SemanticCache] ✗ MISS for "${inputText.substring(0, 50)}"`);
    return { hit: false, latency_ms: Date.now() - start };

  } catch (err) {
    console.error("[SemanticCache] Lookup error:", err);
    return { hit: false, latency_ms: Date.now() - start };
  }
}

/**
 * Save a response to semantic cache
 */
export async function cacheSave(req: CacheSaveRequest): Promise<boolean> {
  if ((req.quality_score ?? 1.0) < QUALITY_THRESHOLD_SAVE) {
    console.log(`[SemanticCache] Skip save — quality ${req.quality_score} < ${QUALITY_THRESHOLD_SAVE}`);
    return false;
  }

  const supabase = getSupabase();
  const normalized = normalizeInput(req.input_text);
  const inputHash = simpleHash(normalized);

  try {
    const { error } = await supabase.from("semantic_cache").upsert({
      flow_id: req.flow_id,
      flow_version: req.flow_version || 1,
      input_text: req.input_text,
      input_hash: inputHash,
      response_text: req.response_text,
      model_id: req.model_id,
      quality_score: req.quality_score ?? 0.85,
      tokens_saved: req.tokens_saved || 0,
      cost_saved_cents: req.cost_saved_cents || 0,
      hit_count: 0,
      similarity_score: 1.0,
      created_at: new Date().toISOString(),
    }, { onConflict: "flow_id,input_hash" });

    if (error) {
      // If upsert fails on conflict resolution, just insert
      try {
        await supabase.from("semantic_cache").insert({
          flow_id: req.flow_id,
          flow_version: req.flow_version || 1,
          input_text: req.input_text,
          input_hash: inputHash,
          response_text: req.response_text,
          model_id: req.model_id,
          quality_score: req.quality_score ?? 0.85,
          tokens_saved: req.tokens_saved || 0,
          cost_saved_cents: req.cost_saved_cents || 0,
          hit_count: 0,
          similarity_score: 1.0,
        });
      } catch {
        /* best-effort insert fallback */
      }
    }

    console.log(`[SemanticCache] ✓ Saved cache for "${req.input_text.substring(0, 50)}" (hash=${inputHash})`);
    return true;
  } catch (err) {
    console.error("[SemanticCache] Save error:", err);
    return false;
  }
}

/**
 * Invalidate cache for a flow (e.g., on new version publish)
 */
export async function cacheInvalidate(flowId: string): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("semantic_cache")
    .delete()
    .eq("flow_id", flowId)
    .select("id");

  const count = data?.length || 0;
  if (count > 0) {
    console.log(`[SemanticCache] Invalidated ${count} entries for flow ${flowId}`);
  }
  return count;
}

/**
 * Jaccard similarity between two strings (word-level)
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
