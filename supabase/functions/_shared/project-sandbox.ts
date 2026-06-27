/**
 * Um sandbox E2B por projeto — criado pelo agente, reutilizado sempre, encerrado só ao excluir o projeto.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  E2B_TEMPLATE_DEFAULT,
  FORGE_E2B_APP,
  FORGE_PROJECT_META_KEY,
  e2bDeleteSandboxWithRetry,
  e2bListSandboxes,
  forgeSandboxMetadata,
  patchProjectFilesForE2b,
} from "./e2b.ts";
import { createValidatedE2bSandbox } from "./e2b-smoke.ts";
import { e2bRestConnect, type E2bRestSandbox } from "./e2b-rest.ts";

/** Timeout de idle: 15 min. Auto-pausa via lifecycle config. */
const SANDBOX_TIMEOUT_SEC = 15 * 60;

export type ProjectSandboxMeta = {
  previewSandboxId?: string;
  previewExpiresAt?: string;
  previewUrl?: string;
  previewPort?: number;
  e2bTemplate?: string;
  /** Circuit breaker for creation storms (used by ensure + preview-boot). */
  e2bCreationCircuit?: {
    attempts?: number;
    lastError?: string;
    cooldownUntil?: string; // ISO
  };
};

export function readSandboxMeta(
  meta: Record<string, unknown> | null | undefined,
): ProjectSandboxMeta {
  const m = meta ?? {};
  const circuitRaw = (m.e2bCreationCircuit ?? {}) as Record<string, unknown>;
  return {
    previewSandboxId: typeof m.previewSandboxId === "string" ? m.previewSandboxId : undefined,
    previewExpiresAt: typeof m.previewExpiresAt === "string" ? m.previewExpiresAt : undefined,
    previewUrl: typeof m.previewUrl === "string" ? m.previewUrl : undefined,
    previewPort: typeof m.previewPort === "number" ? m.previewPort : undefined,
    e2bTemplate: typeof m.e2bTemplate === "string" ? m.e2bTemplate : undefined,
    e2bCreationCircuit: {
      attempts: typeof circuitRaw.attempts === "number" ? circuitRaw.attempts : undefined,
      lastError: typeof circuitRaw.lastError === "string" ? circuitRaw.lastError : undefined,
      cooldownUntil:
        typeof circuitRaw.cooldownUntil === "string" ? circuitRaw.cooldownUntil : undefined,
    },
  };
}

/** Returns true + details if creation is in cooldown (prevents infinite creation loops on bad keys/transients). */
export function isE2bCreationCoolingDown(sm: ProjectSandboxMeta): {
  cooled: boolean;
  attempts?: number;
  until?: string;
  lastError?: string;
} {
  const c = sm.e2bCreationCircuit;
  if (!c?.cooldownUntil) return { cooled: false };
  const until = Date.parse(c.cooldownUntil);
  if (Number.isFinite(until) && until > Date.now()) {
    return { cooled: true, attempts: c.attempts, until: c.cooldownUntil, lastError: c.lastError };
  }
  return { cooled: false };
}

/**
 * Record a creation attempt outcome into projects.meta.
 * On failure: bumps attempts, sets lastError + exponential cooldown (capped).
 * On success: resets circuit.
 */
async function recordE2bCreationOutcome(
  supabase: SupabaseClient,
  projectId: string,
  existing: Record<string, unknown>,
  ok: boolean,
  errorMsg?: string,
): Promise<void> {
  const prev = (existing.e2bCreationCircuit ?? {}) as Record<string, unknown>;
  const attempts = (typeof prev.attempts === "number" ? prev.attempts : 0) + (ok ? 0 : 1);
  const next: Record<string, unknown> = { ...existing };

  if (ok) {
    // success: clear circuit
    delete (next as any).e2bCreationCircuit;
  } else {
    const baseDelay = Math.min(5 * 60_000, 15000 * Math.pow(2, Math.min(attempts, 6)));
    const jitter = Math.floor(Math.random() * 5000);
    const cooldownUntil = new Date(Date.now() + baseDelay + jitter).toISOString();
    next.e2bCreationCircuit = {
      attempts,
      lastError: (errorMsg || "unknown").slice(0, 300),
      cooldownUntil,
    };
  }

  try {
    await supabase.from("projects").update({ meta: next }).eq("id", projectId);
  } catch (e) {
    console.warn("[project-sandbox] failed to record e2b circuit outcome", e);
  }
}

/** Remove campos de preview/sandbox do meta — após kill E2B ou sandbox stale. */
export function clearedSandboxMetaFields(
  existing: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...existing,
    previewSandboxId: undefined,
    previewUrl: undefined,
    previewExpiresAt: undefined,
    previewReady: undefined,
    previewPort: undefined,
    e2bTemplate: undefined,
  };
}

export async function clearProjectSandboxMeta(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  const { existing } = await loadProjectMeta(supabase, projectId);
  await supabase
    .from("projects")
    .update({ meta: clearedSandboxMetaFields(existing) })
    .eq("id", projectId);
}

export async function loadProjectMeta(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ existing: Record<string, unknown>; sm: ProjectSandboxMeta }> {
  const { data: project } = await supabase
    .from("projects")
    .select("meta")
    .eq("id", projectId)
    .single();
  const existing = (project?.meta ?? {}) as Record<string, unknown>;
  return { existing, sm: readSandboxMeta(existing) };
}

export type ConnectSandboxResult = {
  sandbox: E2bRestSandbox;
  sandboxId: string;
  reused: boolean;
};

const NO_SANDBOX_MSG =
  "Ainda não há ambiente ao vivo. Envie um pedido ao agente para ele começar a programar.";

async function saveSandboxId(
  supabase: SupabaseClient,
  projectId: string,
  existing: Record<string, unknown>,
  sandboxId: string,
): Promise<void> {
  await supabase
    .from("projects")
    .update({ meta: { ...existing, previewSandboxId: sandboxId } })
    .eq("id", projectId);
}

/** Reuso: reconecta sandbox existente — nunca cria um novo. */
export async function connectExistingProjectSandbox(
  supabase: SupabaseClient,
  projectId: string,
  apiKey: string,
): Promise<ConnectSandboxResult> {
  const { sm } = await loadProjectMeta(supabase, projectId);
  if (!sm.previewSandboxId) {
    throw new Error(
      "Sandbox E2B ainda não existe neste projeto — use modo Build para criar o ambiente.",
    );
  }
  const sandbox = await e2bRestConnect(apiKey, sm.previewSandboxId, SANDBOX_TIMEOUT_SEC);
  return { sandbox, sandboxId: sandbox.sandboxId, reused: true };
}

/** Agente: cria sandbox uma única vez por projeto; depois só reconecta. */
export async function ensureAgentProjectSandbox(
  supabase: SupabaseClient,
  projectId: string,
  apiKey: string,
  _template = E2B_TEMPLATE_DEFAULT,
): Promise<ConnectSandboxResult> {
  const { existing, sm } = await loadProjectMeta(supabase, projectId);

  // Circuit breaker: fail fast on repeated creation errors
  const circuit = isE2bCreationCoolingDown(sm);
  if (circuit.cooled) {
    const msg = `E2B creation circuit open (attempts=${circuit.attempts ?? 0}). ${circuit.lastError ?? ""} Cooldown until ${circuit.until}. Use a valid E2B key or wait.`;
    const err = new Error(msg) as Error & { code?: string };
    err.code = "e2b_creation_circuit";
    throw err;
  }

  if (sm.previewSandboxId) {
    try {
      const sandbox = await e2bRestConnect(apiKey, sm.previewSandboxId, SANDBOX_TIMEOUT_SEC);
      return { sandbox, sandboxId: sandbox.sandboxId, reused: true };
    } catch (e) {
      console.warn("[project-sandbox] sandbox unreachable, recreating:", sm.previewSandboxId, e);
      await killProjectSandbox(apiKey, sm.previewSandboxId);
      await clearProjectSandboxMeta(supabase, projectId);
    }
  }

  let created: { sandbox: E2bRestSandbox; templateUsed: string } | null = null;
  try {
    created = await createValidatedE2bSandbox(apiKey, forgeSandboxMetadata(projectId));
  } catch (createErr) {
    const msg = createErr instanceof Error ? createErr.message : String(createErr);
    await recordE2bCreationOutcome(supabase, projectId, existing, false, msg);
    throw createErr;
  }

  const { sandbox, templateUsed } = created;
  await saveSandboxId(supabase, projectId, existing, sandbox.sandboxId);
  await recordE2bCreationOutcome(supabase, projectId, existing, true);

  const { data: files } = await supabase
    .from("project_files")
    .select("path, content")
    .eq("project_id", projectId);
  if (files?.length) {
    await syncProjectFilesToSandbox(sandbox, files);
  }

  console.log(`[project-sandbox] created ${sandbox.sandboxId} template=${templateUsed}`);
  return { sandbox, sandboxId: sandbox.sandboxId, reused: false };
}

/** Preview: reconecta; recria só se connect falhar. */
export async function connectProjectSandboxForPreview(
  supabase: SupabaseClient,
  projectId: string,
  apiKey: string,
): Promise<ConnectSandboxResult> {
  const { sm } = await loadProjectMeta(supabase, projectId);

  // Circuit: same protection as agent path
  const circuit = isE2bCreationCoolingDown(sm);
  if (circuit.cooled) {
    const msg = `E2B creation circuit open (attempts=${circuit.attempts ?? 0}). ${circuit.lastError ?? ""} Cooldown until ${circuit.until}.`;
    const err = new Error(msg) as Error & { code?: string };
    err.code = "e2b_creation_circuit";
    throw err;
  }

  if (!sm.previewSandboxId) {
    throw new Error(NO_SANDBOX_MSG);
  }

  try {
    const sandbox = await e2bRestConnect(apiKey, sm.previewSandboxId, SANDBOX_TIMEOUT_SEC);
    return { sandbox, sandboxId: sandbox.sandboxId, reused: true };
  } catch (e) {
    console.warn("[project-sandbox] preview connect failed, recreating:", e);
    await killProjectSandbox(apiKey, sm.previewSandboxId);
    await clearProjectSandboxMeta(supabase, projectId);
    const res = await ensureAgentProjectSandbox(supabase, projectId, apiKey);
    return res;
  }
}

export type ProjectSandboxKillResult = {
  killed: string[];
  failed: string[];
  listed: string[];
};

/** Excluir projeto: encerra sandbox pelo meta e por metadata E2B (sem fantasmas). */
export async function killAllProjectSandboxes(
  apiKey: string,
  projectId: string,
  knownSandboxId?: string,
): Promise<ProjectSandboxKillResult> {
  const toKill = new Set<string>();
  if (knownSandboxId?.trim()) toKill.add(knownSandboxId.trim());

  let listed: string[] = [];
  try {
    const rows = await e2bListSandboxes(apiKey, forgeSandboxMetadata(projectId));
    listed = rows.map((r) => r.sandboxID);
    for (const id of listed) toKill.add(id);
  } catch (e) {
    console.warn("[project-sandbox] list by metadata failed:", e);
  }

  const killed: string[] = [];
  const failed: string[] = [];
  for (const id of toKill) {
    const ok = await e2bDeleteSandboxWithRetry(apiKey, id);
    if (ok) {
      killed.push(id);
      console.log(`[project-sandbox] killed ${id} (project ${projectId})`);
    } else {
      failed.push(id);
      console.warn(`[project-sandbox] failed to kill ${id} (project ${projectId})`);
    }
  }

  return { killed, failed, listed };
}

/** @deprecated Use killAllProjectSandboxes */
export async function killProjectSandbox(
  apiKey: string,
  sandboxId: string | undefined,
): Promise<void> {
  if (!sandboxId) return;
  await e2bDeleteSandboxWithRetry(apiKey, sandboxId);
}

/** Lista sandboxes FORGE órfãos (projeto já removido do Supabase). */
export async function listForgeOrphanSandboxes(
  apiKey: string,
  supabase: SupabaseClient,
): Promise<Array<{ sandboxID: string; projectId: string | null }>> {
  const rows = await e2bListSandboxes(apiKey, { forge_app: FORGE_E2B_APP });
  const orphans: Array<{ sandboxID: string; projectId: string | null }> = [];

  for (const row of rows) {
    const projectId = row.metadata?.[FORGE_PROJECT_META_KEY] ?? null;
    if (!projectId) {
      orphans.push({ sandboxID: row.sandboxID, projectId: null });
      continue;
    }
    const { data } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
    if (!data) orphans.push({ sandboxID: row.sandboxID, projectId });
  }

  return orphans;
}

/**
 * Segunda varredura de higiene para sandboxes FORGE órfãos.
 * Usado após exclusão do projeto para matar resíduos legados que escaparam do cleanup primário.
 */
export async function purgeForgeOrphanSandboxes(
  apiKey: string,
  supabase: SupabaseClient,
  opts?: { projectId?: string },
): Promise<{
  orphans: Array<{ sandboxID: string; projectId: string | null }>;
  killed: string[];
  failed: string[];
}> {
  const projectId = opts?.projectId?.trim();
  const allOrphans = await listForgeOrphanSandboxes(apiKey, supabase);
  const orphans = projectId
    ? allOrphans.filter((row) => row.projectId === projectId)
    : allOrphans;

  const killed: string[] = [];
  const failed: string[] = [];
  for (const orphan of orphans) {
    const ok = await e2bDeleteSandboxWithRetry(apiKey, orphan.sandboxID);
    if (ok) killed.push(orphan.sandboxID);
    else failed.push(orphan.sandboxID);
  }

  return { orphans, killed, failed };
}

export async function syncProjectFilesToSandbox(
  sandbox: E2bRestSandbox,
  files: Array<{ path: string; content?: string | null }>,
): Promise<void> {
  const payload = patchProjectFilesForE2b(files);
  if (payload.length > 0) await sandbox.files.write(payload);
}

export function previewUrlFromSandbox(sandbox: E2bRestSandbox, port: number): string {
  const host = sandbox.getHost(port);
  return host.startsWith("http") ? host : `https://${host}`;
}
