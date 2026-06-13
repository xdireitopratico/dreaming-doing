/**
 * Prometheus pipeline UI state — localStorage scoped per agent project.
 * Migrates/removes vibrant global keys (ps_phase, ps_onboarding_*, etc.).
 */

export const PS_PIPELINE_FIELDS = ["phase", "flow_id", "prompt", "quality_model"] as const;
export type PsPipelineField = (typeof PS_PIPELINE_FIELDS)[number];

/** Vibrant / early FORGE global keys (no projectId suffix). */
export const PS_LEGACY_GLOBAL_KEYS = [
  "ps_phase",
  "ps_flow_id",
  "ps_prompt",
  "ps_quality_model",
] as const;

const LEGACY_KEY_BY_FIELD: Record<PsPipelineField, (typeof PS_LEGACY_GLOBAL_KEYS)[number]> = {
  phase: "ps_phase",
  flow_id: "ps_flow_id",
  prompt: "ps_prompt",
  quality_model: "ps_quality_model",
};

const MIGRATION_FLAG_PREFIX = "ps_storage_migrated_";

function storageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

/** Scoped key: ps_{field}_{projectId} — never global. */
export function psStorageKey(projectId: string | undefined, field: PsPipelineField): string | null {
  if (!projectId?.trim()) return null;
  return `ps_${field}_${projectId}`;
}

function listLocalStorageKeys(): string[] {
  if (!storageAvailable()) return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  return keys;
}

/** Copy vibrant globals into scoped keys when scoped are empty; drop globals. */
export function migrateLegacyPrometheusStorage(projectId: string): void {
  if (!storageAvailable() || !projectId.trim()) return;

  const flag = `${MIGRATION_FLAG_PREFIX}${projectId}`;
  if (localStorage.getItem(flag) === "1") return;

  for (const field of PS_PIPELINE_FIELDS) {
    const scoped = psStorageKey(projectId, field);
    const legacy = LEGACY_KEY_BY_FIELD[field];
    if (!scoped) continue;

    const scopedVal = localStorage.getItem(scoped);
    const legacyVal = localStorage.getItem(legacy);
    if (!scopedVal && legacyVal) {
      localStorage.setItem(scoped, legacyVal);
    }
  }

  for (const legacy of PS_LEGACY_GLOBAL_KEYS) {
    localStorage.removeItem(legacy);
  }

  localStorage.setItem(flag, "1");
}

/** Remove orphan vibrant keys: globals + ps_onboarding_* + bare ps_{field} without UUID suffix. */
let orphanPurged = false;

export function purgeOrphanPrometheusStorageOnce(): void {
  if (orphanPurged || !storageAvailable()) return;
  purgeOrphanPrometheusStorage();
  orphanPurged = true;
}

export function purgeOrphanPrometheusStorage(): void {
  if (!storageAvailable()) return;

  for (const legacy of PS_LEGACY_GLOBAL_KEYS) {
    localStorage.removeItem(legacy);
  }

  const uuidSuffix = /^ps_(phase|flow_id|prompt|quality_model)_[0-9a-f-]{36}$/i;

  for (const key of listLocalStorageKeys()) {
    if (key.startsWith("ps_onboarding_")) {
      localStorage.removeItem(key);
      continue;
    }
    if (/^ps_(phase|flow_id|prompt|quality_model)$/.test(key)) {
      localStorage.removeItem(key);
      continue;
    }
    if (key.startsWith("ps_") && !uuidSuffix.test(key) && !key.startsWith(MIGRATION_FLAG_PREFIX)) {
      const bare = /^ps_(phase|flow_id|prompt|quality_model)_[^0-9a-f-]/i;
      if (bare.test(key)) {
        localStorage.removeItem(key);
      }
    }
  }
}

export function readPsPipelineField(
  projectId: string | undefined,
  field: PsPipelineField,
): string | null {
  const key = psStorageKey(projectId, field);
  if (!key || !storageAvailable()) return null;
  return localStorage.getItem(key);
}

export function writePsPipelineField(
  projectId: string | undefined,
  field: PsPipelineField,
  value: string,
): void {
  const key = psStorageKey(projectId, field);
  if (!key || !storageAvailable()) return;
  localStorage.setItem(key, value);
}

export function removePsPipelineField(projectId: string | undefined, field: PsPipelineField): void {
  const key = psStorageKey(projectId, field);
  if (!key || !storageAvailable()) return;
  localStorage.removeItem(key);
}

export function clearPsPipelineStorage(projectId: string | undefined): void {
  if (!storageAvailable()) return;
  for (const field of PS_PIPELINE_FIELDS) {
    removePsPipelineField(projectId, field);
  }
}