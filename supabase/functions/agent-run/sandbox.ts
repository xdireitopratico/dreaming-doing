// sandbox.ts — E2B via SDK v2 (api.e2b.app)
import { Sandbox } from "npm:e2b@2.14.1";
import {
  E2B_PROJECT_DIR,
  E2B_TEMPLATE_DEFAULT,
  e2bPreviewUrl,
  normalizeProjectPath,
} from "../_shared/e2b.ts";
import type { SandboxProvider, ExecResult, ExecOpts, FileEntry } from "./types.ts";

class E2BSandbox implements SandboxProvider {
  private sandbox: Sandbox | null = null;

  constructor(
    private readonly e2bApiKey: string,
    private readonly e2bTemplate: string = E2B_TEMPLATE_DEFAULT,
  ) {}

  async sync(projectId: string, files: FileEntry[]): Promise<void> {
    if (!this.sandbox) {
      this.sandbox = await Sandbox.create(this.e2bTemplate, {
        apiKey: this.e2bApiKey,
        timeoutMs: 300_000,
      });
      console.log(`Sandbox E2B criado: ${this.sandbox.sandboxId} (projeto ${projectId})`);
    }

    if (files.length === 0) return;

    await this.sandbox.files.write(
      files.map((f) => ({
        path: normalizeProjectPath(f.path),
        data: f.content,
      })),
    );
  }

  async exec(command: string, opts?: ExecOpts): Promise<ExecResult> {
    if (!this.sandbox) {
      return { exitCode: 1, stdout: "", stderr: "Sandbox não inicializado" };
    }

    try {
      const result = await this.sandbox.commands.run(command, {
        cwd: opts?.cwd || E2B_PROJECT_DIR,
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
    if (!this.sandbox) throw new Error("Sandbox não inicializado");
    return e2bPreviewUrl(this.sandbox.sandboxId, port);
  }

  async destroy(): Promise<void> {
    if (!this.sandbox) return;
    try {
      await this.sandbox.kill();
    } catch {
      /* ignore */
    }
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

export function createSandboxProvider(e2bApiKey?: string, e2bTemplate?: string): SandboxProvider {
  const key = e2bApiKey?.trim() || Deno.env.get("E2B_API_KEY")?.trim() || "";
  const template = e2bTemplate?.trim() || E2B_TEMPLATE_DEFAULT;
  if (key) {
    console.log("Usando sandbox E2B (template:", template, ")");
    return new E2BSandbox(key, template);
  }
  console.log("Sandbox E2B não configurado - modo noop");
  return new NoopSandbox();
}