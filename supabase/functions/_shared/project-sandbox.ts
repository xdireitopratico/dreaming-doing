/**
 * Um sandbox E2B por projeto — criado pelo agente, reutilizado sempre, encerrado só ao excluir o projeto.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { E2B_TEMPLATE_DEFAULT, e2bDeleteSandbox, patchProjectFilesForE2b } from "./e2b.ts";
import { createValidatedE2bSandbox } from "./e2b-smoke.ts";
import { e2bRestConnect, type E2bRestSandbox } from "./e2b-rest.ts";

/** Alinhado ao timeout real da API E2B (30 min). */
const SANDBOX_TIMEOUT_SEC = 30 * 60;
const SANDBOX_LEASE_MS = SANDBOX_TIMEOUT_SEC * 1000;

export type ProjectSandboxMeta = {
  previewSandboxId?: string;
  previewExpiresAt?: string;
  previewUrl?: string;
  previewPort?: number;
  e2bTemplate?: string;
};

export function readSandboxMeta(
  meta: Record<string, unknown> | null | undefined,
): ProjectSandboxMeta {
  const m = meta ?? {};
  return {
    previewSandboxId: typeof m.previewSandboxId === "string" ? m.previewSandboxId : undefined,
    previewExpiresAt: typeof m.previewExpiresAt === "string" ? m.previewExpiresAt : undefined,
    previewUrl: typeof m.previewUrl === "string" ? m.previewUrl : undefined,
    previewPort: typeof m.previewPort === "number" ? m.previewPort : undefined,
    e2bTemplate: typeof m.e2bTemplate === "string" ? m.e2bTemplate : undefined,
  };
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

async function touchSandboxLease(
  supabase: SupabaseClient,
  projectId: string,
  existing: Record<string, unknown>,
  sandboxId: string,
  extra?: Partial<ProjectSandboxMeta>,
): Promise<void> {
  await supabase
    .from("projects")
    .update({
      meta: {
        ...existing,
        ...extra,
        previewSandboxId: sandboxId,
        previewExpiresAt: new Date(Date.now() + SANDBOX_LEASE_MS).toISOString(),
      },
    })
    .eq("id", projectId);
}

export type ConnectSandboxResult = {
  sandbox: E2bRestSandbox;
  sandboxId: string;
  reused: boolean;
};

const NO_SANDBOX_MSG =
  "Ainda não há ambiente ao vivo. Envie um pedido ao agente para ele começar a programar.";

/** Agente: cria sandbox uma única vez por projeto; depois só reconecta. */
export async function ensureAgentProjectSandbox(
  supabase: SupabaseClient,
  projectId: string,
  apiKey: string,
  _template = E2B_TEMPLATE_DEFAULT,
): Promise<ConnectSandboxResult> {
  const { existing, sm } = await loadProjectMeta(supabase, projectId);

  if (sm.previewSandboxId) {
    try {
      const sandbox = await e2bRestConnect(apiKey, sm.previewSandboxId, SANDBOX_TIMEOUT_SEC);
      await touchSandboxLease(supabase, projectId, existing, sandbox.sandboxId);
      return { sandbox, sandboxId: sandbox.sandboxId, reused: true };
    } catch (e) {
      console.warn("[project-sandbox] stale sandbox, recreating:", sm.previewSandboxId, e);
      await killProjectSandbox(apiKey, sm.previewSandboxId);
      const cleared = {
        ...existing,
        previewSandboxId: undefined,
        previewUrl: undefined,
        previewExpiresAt: undefined,
      };
      await supabase.from("projects").update({ meta: cleared }).eq("id", projectId);
    }
  }

  const { sandbox, templateUsed } = await createValidatedE2bSandbox(apiKey);

  await touchSandboxLease(supabase, projectId, existing, sandbox.sandboxId, {
    previewUrl: undefined,
    e2bTemplate: templateUsed,
  });

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
  const { existing, sm } = await loadProjectMeta(supabase, projectId);

  if (!sm.previewSandboxId) {
    throw new Error(NO_SANDBOX_MSG);
  }

  try {
    const sandbox = await e2bRestConnect(apiKey, sm.previewSandboxId, SANDBOX_TIMEOUT_SEC);
    await touchSandboxLease(supabase, projectId, existing, sandbox.sandboxId);
    return { sandbox, sandboxId: sandbox.sandboxId, reused: true };
  } catch (e) {
    console.warn("[project-sandbox] preview connect failed, recreating:", e);
    await killProjectSandbox(apiKey, sm.previewSandboxId);
    return ensureAgentProjectSandbox(supabase, projectId, apiKey);
  }
}

/** Excluir projeto: encerra o sandbox E2B deste projeto. */
export async function killProjectSandbox(
  apiKey: string,
  sandboxId: string | undefined,
): Promise<void> {
  if (!sandboxId) return;
  const ok = await e2bDeleteSandbox(apiKey, sandboxId);
  if (ok) console.log(`[project-sandbox] killed ${sandboxId}`);
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