// ============================================================================
// IDEMPOTENCY — Chaves de idempotência para requests repetidos
// ============================================================================

import { supabaseAdmin } from "./prometheus-db.ts";

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export interface IdempotencyResult {
  key: string;
  result: unknown;
  expires_at: string;
}

/**
 * Verifica se uma chave de idempotência já foi processada.
 * Retorna o resultado cached se existir, null caso contrário.
 */
export async function checkIdempotency(key: string): Promise<unknown | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("idempotency_keys")
    .select("result")
    .eq("key", key)
    .gt("expires_at", new Date().toISOString())
    .single();
  
  if (error || !data) return null;
  return (data as { result: unknown }).result;
}

/**
 * Armazena resultado de uma operação idempotente.
 */
export async function storeIdempotency(key: string, result: unknown, ttlHours = 24): Promise<void> {
  const sb = supabaseAdmin();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  
  await (sb.from("idempotency_keys" as any) as any).upsert({
    key,
    result,
    expires_at: expiresAt,
  });
}

/**
 * Middleware para extrair ou gerar idempotency key do request.
 */
export function getIdempotencyKey(req: Request): string {
  return req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key") || generateIdempotencyKey();
}