// tools/fs.ts — FileSystem tools (opera no Supabase project_files)
import type { ToolRegistry } from "../registry.ts";
import type { FileEntry } from "../types.ts";

export interface FsContext {
  supabase: any;
  projectId: string;
}

function minimatch(pattern: string, path: string): boolean {
  const re = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR>>/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${re}$`).test(path);
}

export function registerFsTools(registry: ToolRegistry, ctx: FsContext): void {
  const { supabase, projectId } = ctx;

  registry.register(
    {
      name: "fs_read",
      description: "Lê o conteúdo completo de um arquivo do projeto. Use antes de modificar qualquer arquivo existente.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Caminho do arquivo (ex: src/index.html)" } },
        required: ["path"],
      },
    },
    async (args) => {
      const path = args.path as string;
      const { data, error } = await supabase
        .from("project_files")
        .select("content")
        .eq("project_id", projectId)
        .eq("path", path)
        .maybeSingle();
      if (error) return { toolCallId: "", ok: false, output: null, error: error.message };
      if (!data) return { toolCallId: "", ok: false, output: null, error: `Arquivo "${path}" não encontrado` };
      return { toolCallId: "", ok: true, output: data.content };
    },
  );

  registry.register(
    {
      name: "fs_write",
      description: "Cria ou sobrescreve um arquivo do projeto. Sempre escreva o conteúdo COMPLETO do arquivo.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Caminho do arquivo" },
          content: { type: "string", description: "Conteúdo completo do arquivo" },
        },
        required: ["path", "content"],
      },
    },
    async (args) => {
      const path = args.path as string;
      const content = args.content as string;
      const { error } = await supabase.from("project_files").upsert(
        {
          project_id: projectId,
          path,
          content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,path" },
      );
      if (error) return { toolCallId: "", ok: false, output: null, error: error.message };
      return { toolCallId: "", ok: true, output: `Arquivo "${path}" salvo (${content.length} caracteres)`, artifacts: [path] };
    },
  );

  registry.register(
    {
      name: "fs_delete",
      description: "Remove um arquivo do projeto permanentemente.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Caminho do arquivo a remover" } },
        required: ["path"],
      },
    },
    async (args) => {
      const path = args.path as string;
      const { error } = await supabase
        .from("project_files")
        .delete()
        .eq("project_id", projectId)
        .eq("path", path);
      if (error) return { toolCallId: "", ok: false, output: null, error: error.message };
      return { toolCallId: "", ok: true, output: `Arquivo "${path}" removido` };
    },
  );

  registry.register(
    {
      name: "fs_list",
      description: "Lista arquivos do projeto. Suporta glob patterns para filtrar (ex: src/**/*.ts). Sem argumentos, lista todos.",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string", description: "Glob pattern opcional (ex: **/*.ts)" } },
        required: [],
      },
    },
    async (args) => {
      const pattern = (args.pattern as string) || "**/*";
      const { data, error } = await supabase
        .from("project_files")
        .select("id, path, updated_at")
        .eq("project_id", projectId)
        .order("path");
      if (error) return { toolCallId: "", ok: false, output: null, error: error.message };
      const files = (data ?? []).map((f: FileEntry) => f.path);
      const filtered = filterGlob(files, pattern);
      return { toolCallId: "", ok: true, output: filtered };
    },
  );

  registry.register(
    {
      name: "fs_search",
      description: "Busca texto dentro dos arquivos do projeto (grep). Use para encontrar onde algo está definido.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Texto ou regex a buscar" },
          filePattern: { type: "string", description: "Filtrar por tipo de arquivo (ex: *.ts, *.tsx)" },
        },
        required: ["pattern"],
      },
    },
    async (args) => {
      const searchPattern = args.pattern as string;
      const filePattern = (args.filePattern as string) || "*";
      const { data, error } = await supabase
        .from("project_files")
        .select("id, path, content")
        .eq("project_id", projectId);
      if (error) return { toolCallId: "", ok: false, output: null, error: error.message };
      const results: Array<{ path: string; line: number; text: string }> = [];
      const filePaths = (data ?? []).filter((f: FileEntry) => minimatch(filePattern, f.path));
      const regex = tryRegex(searchPattern);
      for (const f of filePaths) {
        if (!f.content) continue;
        const lines = f.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (regex ? regex.test(lines[i]) : lines[i].toLowerCase().includes(searchPattern.toLowerCase())) {
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

function filterGlob(files: string[], pattern: string): string[] {
  const segs = pattern.split("/");
  const hasRecursive = segs.some(s => s === "**");
  if (!hasRecursive && segs.length === 1) {
    return files.filter(f => {
      const name = f.split("/").pop()!;
      return minimatchName(pattern, name);
    });
  }
  return files.filter(f => minimatch(pattern, f));
}

function minimatchName(pattern: string, name: string): boolean {
  const re = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${re}$`).test(name);
}

function tryRegex(pattern: string): RegExp | null {
  try { return new RegExp(pattern, "i"); } catch { return null; }
}
