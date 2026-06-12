// sandbox.ts — E2B via REST; sandbox nasce no 1º sync do agente e permanece para o preview.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { E2B_TEMPLATE_DEFAULT, e2bPreviewUrl } from "../_shared/e2b.ts";
import {
  clearProjectSandboxMeta,
  connectExistingProjectSandbox,
  ensureAgentProjectSandbox,
  killProjectSandbox,
  syncProjectFilesToSandbox,
} from "../_shared/project-sandbox.ts";
import type { E2bRestSandbox } from "../_shared/e2b-rest.ts";
import type { SandboxProvider, ExecResult, ExecOpts, FileEntry } from "./types.ts";

export type SandboxProviderOptions = {
  /** false em Plan mode — só reconecta previewSandboxId existente. */
  allowCreate?: boolean;
};

class E2BSandbox implements SandboxProvider {
  private sandbox: E2bRestSandbox | null = null;

  constructor(
    private readonly e2bApiKey: string,
    private readonly supabase: SupabaseClient,
    private readonly projectId: string,
    private readonly e2bTemplate: string = E2B_TEMPLATE_DEFAULT,
    private readonly allowCreate = true,
  ) {}

  private async ensure(): Promise<E2bRestSandbox> {
    if (this.sandbox) return this.sandbox;

    if (!this.allowCreate) {
      const { sandbox } = await connectExistingProjectSandbox(
        this.supabase,
        this.projectId,
        this.e2bApiKey,
      );
      this.sandbox = sandbox;
      console.log(`Sandbox E2B reutilizado (sem criar): ${sandbox.sandboxId} (projeto ${this.projectId})`);
      return sandbox;
    }

    // Build: só cria sandbox se o projeto tem arquivos para sincronizar.
    const { count } = await this.supabase
      .from("project_files")
      .select("*", { count: "exact", head: true })
      .eq("project_id", this.projectId);
    if (!count || count === 0) {
      throw new Error(
        "Nenhum arquivo no projeto. Crie arquivos com fs_write antes de usar shell_exec.",
      );
    }

    const { sandbox, reused } = await ensureAgentProjectSandbox(
      this.supabase,
      this.projectId,
      this.e2bApiKey,
      this.e2bTemplate,
    );
    this.sandbox = sandbox;
    console.log(
      `Sandbox E2B ${reused ? "reutilizado" : "criado"}: ${sandbox.sandboxId} (projeto ${this.projectId})`,
    );
    return sandbox;
  }

  async sync(_projectId: string, files: FileEntry[]): Promise<void> {
    if (!this.sandbox) return;
    if (files.length === 0) return;
    await syncProjectFilesToSandbox(this.sandbox, files);
  }

  async exec(command: string, opts?: ExecOpts): Promise<ExecResult> {
    const sb = await this.ensure();
    let cmd = command;
    if (opts?.env && Object.keys(opts.env).length > 0) {
      const exports = Object.entries(opts.env)
        .map(([k, v]) => `export ${k}='${String(v).replace(/'/g, `'\\''`)}'`)
        .join("; ");
      cmd = `${exports}; ${command}`;
    }
    try {
      const result = await sb.commands.run(cmd, {
        cwd: opts?.cwd || "/home/user",
        timeoutMs: opts?.timeout || 60_000,
      });
      return {
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { exitCode: 1, stdout: "", stderr: msg };
    }
  }

  async getPreviewUrl(port: number): Promise<string | null> {
    // LAZY: só retorna URL se a sandbox já foi alocada por um exec() anterior.
    // Nunca chama ensure() aqui — E2B só nasce DEPOIS do 1º shell_exec do run,
    // que é quando o agente de fato precisa executar algo.
    if (!this.sandbox) return null;
    return e2bPreviewUrl(this.sandbox.sandboxId, port);
  }

  /** Mantém sandbox vivo para preview (caso feliz). */
  async destroy(): Promise<void> {
    this.sandbox = null;
  }

  /** Mata o sandbox de fato — chamado em falha/cancelamento para evitar leaking. */
  async kill(): Promise<void> {
    if (!this.sandbox) return;
    const sandboxId = this.sandbox.sandboxId;
    try {
      await this.sandbox.kill();
    } catch (e) {
      console.warn("[sandbox] kill failed:", (e as Error).message);
      await killProjectSandbox(this.e2bApiKey, sandboxId).catch(() => {});
    }
    this.sandbox = null;
    try {
      await clearProjectSandboxMeta(this.supabase, this.projectId);
    } catch (e) {
      console.warn("[sandbox] failed to clear project sandbox meta:", e);
    }
  }
}

class NoopSandbox implements SandboxProvider {
  async sync(_projectId: string, _files: FileEntry[]): Promise<void> {}
  async exec(_command: string, _opts?: ExecOpts): Promise<ExecResult> {
    return { exitCode: 0, stdout: "[sandbox não disponível - execução simulada]", stderr: "" };
  }
  async getPreviewUrl(_port: number): Promise<string | null> {
    return null;
  }
  async destroy(): Promise<void> {}
  async kill(): Promise<void> {}
}

export function createSandboxProvider(
  e2bApiKey?: string,
  e2bTemplate?: string,
  supabase?: SupabaseClient,
  projectId?: string,
  opts?: SandboxProviderOptions,
): SandboxProvider {
  const key = e2bApiKey?.trim() || "";
  const template = e2bTemplate?.trim() || E2B_TEMPLATE_DEFAULT;
  const allowCreate = opts?.allowCreate !== false;
  if (key && supabase && projectId) {
    console.log(
      "Usando sandbox E2B REST (template:",
      template,
      allowCreate ? "create+reuse" : "reuse-only",
      ")",
    );
    return new E2BSandbox(key, supabase, projectId, template, allowCreate);
  }
  console.log("Sandbox E2B não configurado - modo noop");
  return new NoopSandbox();
}
