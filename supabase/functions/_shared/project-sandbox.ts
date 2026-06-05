/** Sandbox E2B por projeto — criar no agente, reutilizar no preview (sem matar ao fim do turno). */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Sandbox } from "npm:e2b@2.14.1";
import {
  E2B_PROJECT_DIR,
  E2B_TEMPLATE_DEFAULT,
  patchProjectFilesForE2b,
} from "./e2b.ts";

const SANDBOX_TTL_MS = 25 * 60 * 1000;

export type ProjectSandboxMeta = {
  previewSandboxId?: string;
  previewExpiresAt?: string;
  previewUrl?: string;
  previewPort?: number;
};

export function readSandboxMeta(meta: Record<string, unknown> | null | undefined): ProjectSandboxMeta {
  const m = meta ?? {};
  return {
    previewSandboxId: typeof m.previewSandboxId === "string" ? m.previewSandboxId : undefined,
    previewExpiresAt: typeof m.previewExpiresAt === "string" ? m.previewExpiresAt : undefined,
    previewUrl: typeof m.previewUrl === "string" ? m.previewUrl : undefined,
    previewPort: typeof m.previewPort === "number" ? m.previewPort : undefined,
  };
}

function isMetaValid(sm: ProjectSandboxMeta): boolean {
  if (!sm.previewSandboxId || !sm.previewExpiresAt) return false;
  return new Date(sm.previewExpiresAt).getTime() > Date.now() + 30_000;
}

export async function persistSandboxMeta(
  supabase: SupabaseClient,
  projectId: string,
  existing: Record<string, unknown>,
  patch: Partial<ProjectSandboxMeta>,
): Promise<void> {
  const expiresAt = patch.previewExpiresAt ??
    new Date(Date.now() + SANDBOX_TTL_MS).toISOString();
  await supabase.from("projects").update({
    meta: {
      ...existing,
      ...patch,
      previewExpiresAt: expiresAt,
    },
  }).eq("id", projectId);
}

export type ConnectSandboxResult = {
  sandbox: Sandbox;
  sandboxId: string;
  reused: boolean;
};

/** Conecta sandbox existente ou cria um novo; `forceNew` encerra o anterior. */
export async function connectOrCreateProjectSandbox(
  supabase: SupabaseClient,
  projectId: string,
  apiKey: string,
  opts?: { forceNew?: boolean; template?: string },
): Promise<ConnectSandboxResult> {
  const { data: project } = await supabase
    .from("projects")
    .select("meta")
    .eq("id", projectId)
    .single();

  const existing = (project?.meta ?? {}) as Record<string, unknown>;
  const sm = readSandboxMeta(existing);
  const template = opts?.template?.trim() || E2B_TEMPLATE_DEFAULT;

  if (opts?.forceNew && sm.previewSandboxId) {
    try {
      const old = await Sandbox.connect(sm.previewSandboxId, { apiKey });
      await old.kill();
    } catch { /* já expirou */ }
  }

  if (!opts?.forceNew && isMetaValid(sm) && sm.previewSandboxId) {
    try {
      const sandbox = await Sandbox.connect(sm.previewSandboxId, { apiKey });
      await persistSandboxMeta(supabase, projectId, existing, {
        previewSandboxId: sandbox.sandboxId,
      });
      return { sandbox, sandboxId: sandbox.sandboxId, reused: true };
    } catch (e) {
      console.warn("[project-sandbox] connect failed, creating new:", e);
    }
  }

  const sandbox = await Sandbox.create(template, {
    apiKey,
    timeoutMs: 30 * 60 * 1000,
    network: { maskRequestHost: "localhost:${PORT}" },
  });

  await persistSandboxMeta(supabase, projectId, existing, {
    previewSandboxId: sandbox.sandboxId,
    previewUrl: undefined,
  });

  return { sandbox, sandboxId: sandbox.sandboxId, reused: false };
}

export async function syncProjectFilesToSandbox(
  sandbox: Sandbox,
  files: Array<{ path: string; content?: string | null }>,
): Promise<void> {
  const payload = patchProjectFilesForE2b(files);
  if (payload.length > 0) await sandbox.files.write(payload);
}

export function previewUrlFromSandbox(sandbox: Sandbox, port: number): string {
  const host = sandbox.getHost(port);
  return host.startsWith("http") ? host : `https://${host}`;
}