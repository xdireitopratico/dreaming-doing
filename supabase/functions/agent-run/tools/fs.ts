// tools/fs.ts — 5 FileSystem tools (leitura/escrita no Supabase project_files)
import type { ToolRegistry } from "../registry.ts";
import type { FileEntry } from "../types.ts";

export interface FsContext {
  supabase: any;
  projectId: string;
}

function globMatch(pattern: string, path: string): boolean {
  const re = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<G>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<G>>/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${re}$`).test(path);
}

export function registerFsTools(reg: ToolRegistry, ctx: FsContext): void {
  const { supabase, projectId } = ctx;

  reg.register(
    {
      name: "fs_read",
      description: "Lê o conteúdo completo de um arquivo. Use SEMPRE antes de modificar um arquivo existente.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    async (args) => {
      const { data, error } = await supabase
        .from("project_files")
        .select("content")
        .eq("project_id", projectId).eq("path", args.path).maybeSingle();
      if (error) return { toolCallId: "", ok: false, output: null, error: error.message };
      if (!data) return { toolCallId: "", ok: false, output: null, error: `"${args.path}" não encontrado` };
      return { toolCallId: "", ok: true, output: data.content };
    },
  );

  reg.register(
    {
      name: "fs_write",
      description: "Cria ou sobrescreve um arquivo. Escreva o conteúdo COMPLETO do arquivo.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
    async (args) => {
      const { error } = await supabase.from("project_files").upsert({
        project_id: projectId,
        path: args.path as string,
        content: args.content as string,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,path" });
      if (error) return { toolCallId: "", ok: false, output: null, error: error.message };
      return { toolCallId: "", ok: true, output: `"${args.path}" salvo`, artifacts: [args.path as string] };
    },
  );

  reg.register(
    {
      name: "fs_delete",
      description: "Remove um arquivo permanentemente.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    async (args) => {
      const { error } = await supabase.from("project_files").delete().eq("project_id", projectId).eq("path", args.path);
      if (error) return { toolCallId: "", ok: false, output: null, error: error.message };
      return { toolCallId: "", ok: true, output: `"${args.path}" removido` };
    },
  );

  reg.register(
    {
      name: "fs_list",
      description: "Lista arquivos do projeto. Aceita glob pattern (ex: 'src/**/*.ts') ou vazio para tudo.",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string", description: "Glob opcional (ex: '*.tsx', 'src/**')" } },
        required: [],
      },
    },
    async (args) => {
      const pattern = (args.pattern as string) || "**";
      const { data, error } = await supabase
        .from("project_files")
        .select("path, updated_at")
        .eq("project_id", projectId).order("path");
      if (error) return { toolCallId: "", ok: false, output: null, error: error.message };
      const paths = (data ?? []).map((f: FileEntry) => f.path);
      return { toolCallId: "", ok: true, output: paths.filter((p: string) => globMatch(pattern, p)) };
    },
  );

  reg.register(
    {
      name: "fs_search",
      description: "Busca texto nos arquivos (grep). Use para encontrar definições, imports, referências.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Texto ou regex a buscar" },
          filePattern: { type: "string", description: "Filtrar por tipo (ex: '*.ts')" },
        },
        required: ["pattern"],
      },
    },
    async (args) => {
      const search = args.pattern as string;
      const filePat = (args.filePattern as string) || "**";
      const { data, error } = await supabase
        .from("project_files")
        .select("path, content")
        .eq("project_id", projectId);
      if (error) return { toolCallId: "", ok: false, output: null, error: error.message };

      let regex: RegExp | null = null;
      try { regex = new RegExp(search, "i"); } catch { /* texto literal */ }

      const results: Array<{ path: string; line: number; text: string }> = [];
      for (const f of (data ?? [])) {
        if (!f.content || !globMatch(filePat, f.path)) continue;
        const lines = f.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const match = regex ? regex.test(lines[i]) : lines[i].toLowerCase().includes(search.toLowerCase());
          if (match) {
            results.push({ path: f.path, line: i + 1, text: lines[i].trim().slice(0, 200) });
            if (results.length >= 30) break;
          }
        }
        if (results.length >= 30) break;
      }
      return { toolCallId: "", ok: true, output: results };
    },
  );
}
