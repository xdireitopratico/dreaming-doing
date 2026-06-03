// tools/git.ts — Git tools (opera via sandbox)
import type { ToolRegistry } from "../registry.ts";
import type { SandboxProvider } from "../types.ts";

export interface GitContext {
  sandbox: SandboxProvider;
  projectId: string;
  supabase: any;
}

export function registerGitTools(registry: ToolRegistry, ctx: GitContext): void {
  const { sandbox, projectId, supabase } = ctx;

  async function ensureSandboxReady(): Promise<void> {
    const { data } = await supabase
      .from("project_files")
      .select("*")
      .eq("project_id", projectId);
    await sandbox.sync(projectId, (data ?? []) as any);
  }

  async function git(args: string): Promise<string> {
    const result = await sandbox.exec(`git ${args}`, { cwd: "/home/project" });
    return result.exitCode === 0 ? result.stdout : result.stderr;
  }

  registry.register(
    {
      name: "git_status",
      description: "Mostra o status do repositório: arquivos modificados, staged, untracked.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    async () => {
      await ensureSandboxReady();
      const out = await git("status --short");
      return { toolCallId: "", ok: true, output: out || "(repositório limpo)" };
    },
  );

  registry.register(
    {
      name: "git_diff",
      description: "Mostra as diferenças (diff) das mudanças atuais no código.",
      parameters: {
        type: "object",
        properties: { staged: { type: "boolean", description: "Se true, mostra diff do staged. Padrão: unstaged" } },
        required: [],
      },
    },
    async (args) => {
      await ensureSandboxReady();
      const flag = args.staged ? "--staged" : "";
      const out = await git(`diff ${flag} --stat ; git diff ${flag} -- .`);
      return { toolCallId: "", ok: true, output: out.slice(0, 8000) || "(sem mudanças)" };
    },
  );

  registry.register(
    {
      name: "git_commit",
      description: "Faz commit das mudanças atuais com uma mensagem descritiva.",
      parameters: {
        type: "object",
        properties: { message: { type: "string", description: "Mensagem do commit" } },
        required: ["message"],
      },
    },
    async (args) => {
      await ensureSandboxReady();
      await git(`add -A`);
      const out = await git(`commit -m "${(args.message as string).replace(/"/g, '\\"')}"`);
      return { toolCallId: "", ok: true, output: out.slice(0, 2000) };
    },
  );

  registry.register(
    {
      name: "git_log",
      description: "Mostra o histórico de commits do projeto.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Número máximo de commits. Padrão: 10" } },
        required: [],
      },
    },
    async (args) => {
      await ensureSandboxReady();
      const limit = args.limit || 10;
      const out = await git(`log --oneline -${limit}`);
      return { toolCallId: "", ok: true, output: out || "(sem commits)" };
    },
  );

  registry.register(
    {
      name: "git_branch",
      description: "Lista branches ou cria/alterna entre branches.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "switch"], description: "Ação: list, create ou switch" },
          name: { type: "string", description: "Nome da branch (para create/switch)" },
        },
        required: ["action"],
      },
    },
    async (args) => {
      await ensureSandboxReady();
      const action = args.action as string;
      if (action === "list") {
        const out = await git("branch -a");
        return { toolCallId: "", ok: true, output: out };
      }
      if (action === "create" && args.name) {
        const out = await git(`checkout -b ${args.name}`);
        return { toolCallId: "", ok: true, output: out };
      }
      if (action === "switch" && args.name) {
        const out = await git(`checkout ${args.name}`);
        return { toolCallId: "", ok: true, output: out };
      }
      return { toolCallId: "", ok: false, output: null, error: "Ação inválida ou nome não fornecido" };
    },
  );
}
