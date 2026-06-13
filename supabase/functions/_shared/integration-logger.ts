import { createClient } from "npm:@supabase/supabase-js@2";

export interface UsageLogParams {
  userId?: string;
  provider: string;
  serviceType: string;
  action: string;
  unitsConsumed?: number;
  unitType: string;
  latencyMs?: number;
  success?: boolean;
  errorMessage?: string;
  requestMetadata?: Record<string, any>;
  responseMetadata?: Record<string, any>;
  /** Identifies which edge function originated this log (budget validation) */
  sourceFunction?: string;
}

/**
 * Log usage of any integration provider.
 * Automatically calculates cost based on integration_providers table.
 */
export async function logIntegrationUsage(params: UsageLogParams): Promise<{ costUsd: number; logged: boolean }> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar configuração de preço do provider
    const { data: config } = await supabase
      .from("integration_providers")
      .select("cost_per_unit, unit_multiplier")
      .eq("provider", params.provider)
      .single();

    // Calcular custo automaticamente
    const units = params.unitsConsumed || 1;
    const costUsd = config 
      ? (units / (config.unit_multiplier || 1)) * Number(config.cost_per_unit || 0)
      : 0;

    // Inserir log
    const { error } = await supabase.from("integration_usage_logs").insert({
      user_id: params.userId || null,
      provider: params.provider,
      service_type: params.serviceType,
      action: params.action,
      units_consumed: units,
      unit_type: params.unitType,
      cost_usd: costUsd,
      latency_ms: params.latencyMs || null,
      success: params.success ?? true,
      error_message: params.errorMessage || null,
      request_metadata: params.requestMetadata || {},
      response_metadata: params.responseMetadata || {},
      source_function: params.sourceFunction || null,
    });

    if (error) {
      console.error("[integration-logger] Error inserting log:", error);
      return { costUsd: 0, logged: false };
    }

    console.log(`[integration-logger] Logged ${params.provider}/${params.action}: ${units} ${params.unitType}, $${costUsd.toFixed(6)}`);
    return { costUsd, logged: true };
  } catch (error) {
    console.error("[integration-logger] Unexpected error:", error);
    return { costUsd: 0, logged: false };
  }
}

/**
 * Helper to measure latency of an async operation
 */
export async function withLatencyTracking<T>(
  fn: () => Promise<T>
): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  const result = await fn();
  const latencyMs = Date.now() - start;
  return { result, latencyMs };
}
