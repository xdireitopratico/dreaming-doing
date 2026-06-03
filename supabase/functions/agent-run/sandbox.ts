// sandbox.ts — SandboxProvider (E2B + Noop fallback)
import type { SandboxProvider, ExecResult, ExecOpts, FileEntry } from "./types.ts";

const E2B_API_KEY = Deno.env.get("E2B_API_KEY");
const E2B_TEMPLATE = Deno.env.get("E2B_TEMPLATE") || "nodejs";

class E2BSandbox implements SandboxProvider {
  private sandboxId: string | null = null;
  private baseUrl = "https://api.e2b.dev";
  private projectId = "";

  async sync(projectId: string, files: FileEntry[]): Promise<void> {
    this.projectId = projectId;
    if (!this.sandboxId) {
      await this.createSandbox();
    }
    const body: any = {};
    for (const f of files) {
      body[f.path] = f.content;
    }
    const resp = await fetch(
      `${this.baseUrl}/sandboxes/${this.sandboxId}/filesystem/write`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": E2B_API_KEY!,
        },
        body: JSON.stringify(body),
      },
    );
    if (!resp.ok && resp.status !== 404) {
      const err = await resp.text();
      console.error("E2B sync error:", resp.status, err);
    }
  }

  async exec(command: string, opts?: ExecOpts): Promise<ExecResult> {
    if (!this.sandboxId) throw new Error("Sandbox não inicializado");

    const cwd = opts?.cwd || "/home/project";
    const timeout = opts?.timeout || 60000;

    const resp = await fetch(
      `${this.baseUrl}/sandboxes/${this.sandboxId}/commands`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": E2B_API_KEY!,
        },
        body: JSON.stringify({
          cmd: command,
          cwd,
          timeout_ms: timeout,
        }),
      },
    );

    if (!resp.ok) {
      const err = await resp.text();
      return { exitCode: 1, stdout: "", stderr: `E2B error ${resp.status}: ${err}` };
    }

    const data = await resp.json();
    return {
      exitCode: data.exitCode ?? 0,
      stdout: data.stdout ?? "",
      stderr: data.stderr ?? "",
    };
  }

  async getPreviewUrl(port: number): Promise<string> {
    if (!this.sandboxId) throw new Error("Sandbox não inicializado");
    return `https://${this.sandboxId}-${port}.e2b.dev`;
  }

  async destroy(): Promise<void> {
    if (!this.sandboxId) return;
    try {
      await fetch(`${this.baseUrl}/sandboxes/${this.sandboxId}`, {
        method: "DELETE",
        headers: { "X-API-Key": E2B_API_KEY! },
      });
    } catch { /* ignore */ }
    this.sandboxId = null;
  }

  private async createSandbox(): Promise<void> {
    if (!E2B_API_KEY) throw new Error("E2B_API_KEY não configurada");
    const resp = await fetch(`${this.baseUrl}/sandboxes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": E2B_API_KEY,
      },
      body: JSON.stringify({
        templateID: E2B_TEMPLATE,
        timeout_ms: 300000, // 5 min
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Falha ao criar sandbox E2B: ${resp.status} ${err}`);
    }

    const data = await resp.json();
    this.sandboxId = data.sandboxID;
    console.log(`Sandbox E2B criado: ${this.sandboxId}`);
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

export function createSandboxProvider(): SandboxProvider {
  if (E2B_API_KEY) {
    console.log("Usando sandbox E2B");
    return new E2BSandbox();
  }
  console.log("Sandbox E2B não configurado - usando modo noop (tools de shell vão falhar)");
  return new NoopSandbox();
}
