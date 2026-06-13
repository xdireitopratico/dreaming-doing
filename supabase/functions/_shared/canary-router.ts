/**
 * AetherForge — Canary Router
 * Roteia execuções entre versões canary e stable baseado em hash do session_id.
 * 
 * Lógica:
 * - Se deployment tem canary_percent > 0 e canary_baseline_version_id:
 *   hash(session_id) % 100 < canary_percent → executa versão canary
 *   caso contrário → executa versão stable (baseline)
 * - Se não tem canary config → executa versão atual (sem split)
 * 
 * Máx: ~100 linhas (anti-monolítico)
 */

export interface CanaryConfig {
  canary_percent: number;           // 0-100
  canary_version_id: string | null; // flow_version_id da versão canary
  baseline_version_id: string | null; // flow_version_id da versão stable
}

export interface CanaryDecision {
  is_canary: boolean;
  version_id: string | null;   // qual version_id executar
  percent: number;
  hash_value: number;           // para debug
  reason: string;
}

/**
 * FNV-1a hash for deterministic session routing
 * Garante que o mesmo session_id sempre vai para a mesma versão
 */
function fnv1aHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

/**
 * Decide se uma execução deve usar a versão canary ou stable
 */
export function routeCanary(
  sessionId: string,
  config: CanaryConfig
): CanaryDecision {
  // No canary config → use current version
  if (!config.canary_percent || config.canary_percent <= 0 || !config.canary_version_id) {
    return {
      is_canary: false,
      version_id: config.baseline_version_id,
      percent: 0,
      hash_value: 0,
      reason: "no_canary_config",
    };
  }

  // 100% canary → all traffic to canary
  if (config.canary_percent >= 100) {
    return {
      is_canary: true,
      version_id: config.canary_version_id,
      percent: 100,
      hash_value: 0,
      reason: "full_canary",
    };
  }

  // Deterministic split based on session hash
  const hashValue = fnv1aHash(sessionId) % 100;
  const isCanary = hashValue < config.canary_percent;

  return {
    is_canary: isCanary,
    version_id: isCanary ? config.canary_version_id : config.baseline_version_id,
    percent: config.canary_percent,
    hash_value: hashValue,
    reason: isCanary ? "canary_split" : "stable_split",
  };
}

/**
 * Verifica se canary deve fazer auto-rollback baseado em quality scores
 */
export function shouldAutoRollback(
  canaryAvgQuality: number,
  baselineAvgQuality: number,
  minSamples: number,
  canarySamples: number
): { rollback: boolean; reason: string } {
  if (canarySamples < minSamples) {
    return { rollback: false, reason: `insufficient_samples (${canarySamples}/${minSamples})` };
  }

  if (baselineAvgQuality <= 0) {
    return { rollback: false, reason: "no_baseline_quality" };
  }

  const degradation = (baselineAvgQuality - canaryAvgQuality) / baselineAvgQuality;

  if (degradation > 0.10) {
    return {
      rollback: true,
      reason: `quality_degradation_${(degradation * 100).toFixed(1)}% (canary=${canaryAvgQuality.toFixed(2)} vs baseline=${baselineAvgQuality.toFixed(2)})`,
    };
  }

  return { rollback: false, reason: "quality_ok" };
}
