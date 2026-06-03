// tools/shell.ts — 1 tool universal: shell_exec
// Resolve git, npm, build, lint, test, criação de projeto — tudo via sandbox
import type { ToolRegistry } from "../registry.ts";
import type { SandboxProvider } from "../types.ts";

export interface ShellContext {
  sandbox: SandboxProvider;
  projectId: string;
  supabase: any;
}

export function registerShellTool(reg: ToolRegistry, ctx: ShellContext): void {
  const { sandbox, projectId, supabase } = ctx;

  async function ensureSync(): Promise<void> {
    const { data } = await supabase
      .from("project_files")
      .select("*")
      .eq("project_id", projectId);
    await sandbox.sync(projectId, (data ?? []) as any);
  }

  reg.register(
    {
      name: "shell_exec",
      description: `Executa qualquer comando shell no sandbox do projeto.

Use para:
- git (git init, git add, git commit, git status, git log, git diff, git branch)
- npm/npx/yarn/pnpm/bun (install, create, build, dev, test, lint, format)
- node (node script.js)
- sistema (ls, cat, mkdir, rm, cp, mv, echo, which)
- python/pip (python3 script.py, pip install)
- qualquer comando que exista no sandbox

Exemplos:
- "git init && git add -A && git commit -m 'initial'"
- "npm create vite@latest . -- --template react-ts && npm install"
- "npm run build 2>&1"
- "npm run lint 2>&1 || true"
- "ls -la src/"
- "cat package.json"

Retorna { exitCode, stdout, stderr }. Exit code 0 = sucesso.`,
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando shell completo" },
          cwd: { type: "string", description: "Diretório de trabalho (padrão: raiz do projeto)" },
        },
        required: ["command"],
      },
    },
    async (args) => {
      try {
        await ensureSync();
        const result = await sandbox.exec(args.command as string, {
          cwd: (args.cwd as string) || "/home/project",
          timeout: 180000,
        });
        return {
          toolCallId: "",
          ok: result.exitCode === 0,
          output: {
            exitCode: result.exitCode,
            stdout: result.stdout.slice(-6000),
            stderr: result.stderr.slice(-3000),
          },
        };
      } catch (err: any) {
        return { toolCallId: "", ok: false, output: null, error: `Sandbox: ${err?.message}` };
      }
    },
  );
}
