// sandbox.ts — E2B via SDK v2; sandbox nasce no 1º sync do agente e permanece para o preview.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { E2B_TEMPLATE_DEFAULT, e2bPreviewUrl } from "../_shared/e2b.ts";
import {
  connectOrCreateProjectSandbox,
  syncProjectFilesToSandbox,
} from "../_shared/project-sandbox.ts";
import type { Sandbox } from "npm:e2b@2.14.1";
import type { SandboxProvider, ExecResult, ExecOpts, FileEntry } from "./types.ts";

class E2BSandbox implements SandboxProvider {
  private sandbox: Sandbox | null = null;

  constructor(
    private readonly e2bApiKey: string,
    private readonly supabase: SupabaseClient,
    private readonly projectId: string,
    private readonly e2bTemplate: string = E2B_TEMPLATE_DEFAULT,
  ) {}

  private async ensure(): Promise<Sandbox> {
    if (this.sandbox) return this.sandbox;
    const { sandbox, reused } = await connectOrCreateProjectSandbox(
      this.supabase,
      this.projectId,
      this.e2bApiKey,
      { template: this.e2bTemplate },
    );
    this.sandbox = sandbox;
    console.log(
      `Sandbox E2B ${reused ? "reutilizado" : "criado"}: ${sandbox.sandboxId} (projeto ${this.projectId})`,
    );
    return sandbox;
  }

  async sync(_projectId: string, files: FileEntry[]): Promise<void> {
    const sb = await this.ensure();
    if (files.length === 0) return;
    await syncProjectFilesToSandbox(sb, files);
  }

  async exec(command: string, opts?: ExecOpts): Promise<ExecResult> {
    const sb = await this.ensure();
    try {
      const result = await sb.commands.run(command, {
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

  async getPreviewUrl(port: number): Promise<string> {
    const sb = await this.ensure();
    return e2bPreviewUrl(sb.sandboxId, port);
  }

  /** Não mata o sandbox — preview ao vivo reutiliza a mesma instância. */
  async destroy(): Promise<void> {
    this.sandbox = null;
  }
}

class NoopSandbox implements SandboxProvider {
  async sync(_projectId: string, _files: FileEntry[]): Promise<void> {}
  async exec(_command: string, _opts?: ExecOpts): Promise<ExecResult> {
    return { exitCode: 0, stdout: "[sandbox não disponível - execução simulada]", stderr: "" };
  }
  async getPreviewUrl(_port: number): Promise<string> {
    return "[sandbox não disponível]";
  }
  async destroy(): Promise<void> {}
}

export function createSandboxProvider(
  e2bApiKey?: string,
  e2bTemplate?: string,
  supabase?: SupabaseClient,
  projectId?: string,
): SandboxProvider {
  const key = e2bApiKey?.trim() || Deno.env.get("E2B_API_KEY")?.trim() || "";
  const template = e2bTemplate?.trim() || E2B_TEMPLATE_DEFAULT;
  if (key && supabase && projectId) {
    console.log("Usando sandbox E2B (template:", template, ")");
    return new E2BSandbox(key, supabase, projectId, template);
  }
  console.log("Sandbox E2B não configurado - modo noop");
  return new NoopSandbox();
}