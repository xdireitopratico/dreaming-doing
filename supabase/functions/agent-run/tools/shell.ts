// tools/shell.ts — Shell/Sandbox tools (execução de comandos no sandbox)
import type { ToolRegistry } from "../registry.ts";
import type { SandboxProvider } from "../types.ts";

export interface ShellContext {
  sandbox: SandboxProvider;
  projectId: string;
  supabase: any;
}

export function registerShellTools(registry: ToolRegistry, ctx: ShellContext): void {
  const { sandbox, projectId, supabase } = ctx;

  // Helper: sync files into sandbox before exec
  async function ensureSandboxReady(): Promise<void> {
    const { data } = await supabase
      .from("project_files")
      .select("*")
      .eq("project_id", projectId);
    await sandbox.sync(projectId, (data ?? []) as any);
  }

  registry.register(
    {
      name: "shell_exec",
      description: "Executa um comando shell no sandbox do projeto. Use para rodar scripts, comandos npm, etc. Retorna stdout, stderr e exit code.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando a executar (ex: npm test, ls, cat file.ts)" },
          cwd: { type: "string", description: "Diretório de trabalho (padrão: raiz do projeto)" },
        },
        required: ["command"],
      },
    },
    async (args) => {
      try {
        await ensureSandboxReady();
        const result = await sandbox.exec(args.command as string, {
          cwd: (args.cwd as string) || "/home/project",
        });
        return {
          toolCallId: "",
          ok: result.exitCode === 0,
          output: { exitCode: result.exitCode, stdout: result.stdout.slice(0, 8000), stderr: result.stderr.slice(0, 4000) },
        };
      } catch (err: any) {
        return { toolCallId: "", ok: false, output: null, error: `Sandbox error: ${err?.message ?? "desconhecido"}` };
      }
    },
  );

  registry.register(
    {
      name: "shell_install",
      description: "Instala dependências do projeto (npm install, pip install, cargo add, etc). Execute antes de usar novas bibliotecas.",
      parameters: {
        type: "object",
        properties: {
          manager: { type: "string", description: "Gerenciador: npm, yarn, pnpm, bun, pip, cargo. Padrão: npm" },
          packages: { type: "string", description: "Pacotes a instalar (ex: react react-dom). Vazio = instala todas do package.json" },
          dev: { type: "boolean", description: "Se true, instala como devDependency" },
        },
        required: [],
      },
    },
    async (args) => {
      try {
        await ensureSandboxReady();
        const manager = (args.manager as string) || "npm";
        const packages = (args.packages as string) || "";
        const dev = args.dev ? (manager === "npm" ? "--save-dev" : manager === "yarn" ? "--dev" : "-D") : "";

        let cmd: string;
        if (packages) {
          cmd = `${manager} install ${dev} ${packages}`.trim();
        } else {
          cmd = `${manager} install`;
        }

        const result = await sandbox.exec(cmd, { cwd: "/home/project", timeout: 120000 });
        return {
          toolCallId: "",
          ok: result.exitCode === 0,
          output: {
            exitCode: result.exitCode,
            stdout: result.stdout.slice(-2000),
            stderr: result.stderr.slice(0, 1000),
          },
        };
      } catch (err: any) {
        return { toolCallId: "", ok: false, output: null, error: err?.message };
      }
    },
  );

  registry.register(
    {
      name: "shell_build",
      description: "Executa o build de produção do projeto (npm run build). Verifica se o projeto compila corretamente.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando de build personalizado. Padrão: npm run build" },
        },
        required: [],
      },
    },
    async (args) => {
      try {
        await ensureSandboxReady();
        const cmd = (args.command as string) || "npm run build";
        const result = await sandbox.exec(cmd, { cwd: "/home/project", timeout: 180000 });
        return {
          toolCallId: "",
          ok: result.exitCode === 0,
          output: {
            exitCode: result.exitCode,
            stdout: result.stdout.slice(-3000),
            stderr: result.stderr.slice(0, 3000),
          },
        };
      } catch (err: any) {
        return { toolCallId: "", ok: false, output: null, error: err?.message };
      }
    },
  );

  registry.register(
    {
      name: "shell_lint",
      description: "Roda o linter no projeto para verificar qualidade do código.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando de lint personalizado. Padrão: npm run lint" },
        },
        required: [],
      },
    },
    async (args) => {
      try {
        await ensureSandboxReady();
        const cmd = (args.command as string) || "npm run lint 2>&1 || true";
        const result = await sandbox.exec(cmd, { cwd: "/home/project" });
        return {
          toolCallId: "",
          ok: true,
          output: {
            exitCode: result.exitCode,
            issues: result.stdout.slice(0, 4000) || result.stderr.slice(0, 4000),
          },
        };
      } catch (err: any) {
        return { toolCallId: "", ok: true, output: { issues: err?.message ?? "lint não configurado" } };
      }
    },
  );

  registry.register(
    {
      name: "shell_format",
      description: "Formata o código do projeto (prettier, black, etc).",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando de formatação. Padrão: npm run format" },
        },
        required: [],
      },
    },
    async (args) => {
      try {
        await ensureSandboxReady();
        const cmd = (args.command as string) || "npm run format 2>&1 || true";
        const result = await sandbox.exec(cmd, { cwd: "/home/project" });
        return {
          toolCallId: "",
          ok: true,
          output: { formatted: result.exitCode === 0, output: result.stdout.slice(0, 2000) },
        };
      } catch (err: any) {
        return { toolCallId: "", ok: false, output: null, error: err?.message };
      }
    },
  );

  registry.register(
    {
      name: "shell_dev",
      description: "Inicia o servidor de desenvolvimento e retorna a URL de preview.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Comando dev. Padrão: npm run dev" },
          port: { type: "number", description: "Porta do servidor. Padrão: 5173" },
        },
        required: [],
      },
    },
    async (args) => {
      try {
        await ensureSandboxReady();
        const port = (args.port as number) || 5173;
        const cmd = (args.command as string) || `npm run dev -- --port ${port}`;
        const result = await sandbox.exec(cmd, { cwd: "/home/project" });
        let previewUrl = "";
        try {
          previewUrl = await sandbox.getPreviewUrl(port);
        } catch { /* ignore */ }
        return {
          toolCallId: "",
          ok: true,
          output: {
            exitCode: result.exitCode,
            stdout: result.stdout.slice(0, 2000),
            previewUrl: previewUrl || `http://localhost:${port}`,
          },
        };
      } catch (err: any) {
        return { toolCallId: "", ok: false, output: null, error: err?.message };
      }
    },
  );
}
