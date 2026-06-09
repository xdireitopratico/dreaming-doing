// tools/fs.ts — 7 FileSystem tools (leitura/escrita/edição no Supabase project_files)
import { captureToCodeCorpusAsync } from "../../_shared/code-corpus.ts";
import type { ToolRegistry } from "../registry.ts";
import type { FileEntry } from "../types.ts";

export interface FsContext {
  supabase: any;
  projectId: string;
  userId?: string;
  runId?: string | null;
  stackKind?: string | null;
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

function corpusCapture(
  ctx: FsContext,
  path: string,
  content: string,
  reason: "agent_write" | "agent_edit",
): void {
  captureToCodeCorpusAsync(ctx.supabase, {
    projectId: ctx.projectId,
    userId: ctx.userId,
    path,
    content,
    stackKind: ctx.stackKind,
    runId: ctx.runId,
    reason,
  });
}

export function registerFsTools(reg: ToolRegistry, ctx: FsContext): void {
  const { supabase, projectId } = ctx;

  reg.register(
    {
      name: "fs_read",
      description:
        "Lê o conteúdo completo de um arquivo. Use SEMPRE antes de modificar um arquivo existente.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    async (args) => {
      const { data, error } = await supabase
        .from("project_files")
        .select("content")
        .eq("project_id", projectId).eq("path", args.path).maybeSingle();
      if (error) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error: error.message,
        };
      }
      if (!data) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error: `"${args.path}" não encontrado`,
        };
      }
      return { toolCallId: "", ok: true, output: data.content };
    },
  );

  reg.register(
    {
      name: "fs_write",
      description:
        "Cria ou sobrescreve um arquivo. Escreva o conteúdo COMPLETO do arquivo.",
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
      if (error) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error: error.message,
        };
      }
      corpusCapture(
        ctx,
        args.path as string,
        args.content as string,
        "agent_write",
      );
      // success path for fs_write: loop emits file_diff(pre-capture) + preview_sync + tick (unconditional, live during first-gen seed + follow-ups)
      return {
        toolCallId: "",
        ok: true,
        output: `"${args.path}" salvo`,
        artifacts: [args.path as string],
      };
    },
  );

  reg.register(
    {
      name: "fs_delete",
      description: "Remove um arquivo permanentemente.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
    async (args) => {
      const { error } = await supabase.from("project_files").delete().eq(
        "project_id",
        projectId,
      ).eq("path", args.path);
      if (error) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error: error.message,
        };
      }
      return { toolCallId: "", ok: true, output: `"${args.path}" removido` };
    },
  );

  reg.register(
    {
      name: "fs_list",
      description:
        "Lista arquivos do projeto. Aceita glob pattern (ex: 'src/**/*.ts') ou vazio para tudo.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob opcional (ex: '*.tsx', 'src/**')",
          },
        },
        required: [],
      },
    },
    async (args) => {
      const pattern = (args.pattern as string) || "**";
      const { data, error } = await supabase
        .from("project_files")
        .select("path, updated_at")
        .eq("project_id", projectId).order("path");
      if (error) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error: error.message,
        };
      }
      const paths = (data ?? []).map((f: FileEntry) => f.path);
      return {
        toolCallId: "",
        ok: true,
        output: paths.filter((p: string) => globMatch(pattern, p)),
      };
    },
  );

  reg.register(
    {
      name: "fs_search",
      description:
        "Busca texto nos arquivos (grep). Use para encontrar definições, imports, referências.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Texto ou regex a buscar" },
          filePattern: {
            type: "string",
            description: "Filtrar por tipo (ex: '*.ts')",
          },
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
      if (error) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error: error.message,
        };
      }

      let regex: RegExp | null = null;
      try {
        regex = new RegExp(search, "i");
      } catch { /* texto literal */ }

      const results: Array<{ path: string; line: number; text: string }> = [];
      for (const f of (data ?? [])) {
        if (!f.content || !globMatch(filePat, f.path)) continue;
        const lines = f.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const match = regex
            ? regex.test(lines[i])
            : lines[i].toLowerCase().includes(search.toLowerCase());
          if (match) {
            results.push({
              path: f.path,
              line: i + 1,
              text: lines[i].trim().slice(0, 200),
            });
            if (results.length >= 30) break;
          }
        }
        if (results.length >= 30) break;
      }
      return { toolCallId: "", ok: true, output: results };
    },
  );

  // ─── fs_edit: substituição cirúrgica de texto (como edit_file do Command Code) ───
  reg.register(
    {
      name: "fs_edit",
      description:
        `Substitui um trecho específico de texto em um arquivo. Edição cirúrgica — modifica só o necessário, não reescreve o arquivo inteiro.

Parâmetros:
- path: caminho do arquivo
- oldText: trecho EXATO a substituir (deve bater idêntico, incluindo espaços e indentação)
- newText: novo texto a colocar no lugar
- replaceAll: se true, substitui todas as ocorrências (padrão: false, só a primeira)

Use SEMPRE fs_edit em vez de fs_write quando só precisa mudar algumas linhas.
Use fs_read antes para garantir que oldText bate exatamente.`,
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Caminho do arquivo a editar" },
          oldText: {
            type: "string",
            description: "Trecho exato a ser substituído (match idêntico)",
          },
          newText: {
            type: "string",
            description: "Novo texto a inserir no lugar",
          },
          replaceAll: {
            type: "boolean",
            description: "Substituir todas as ocorrências? Padrão: false",
          },
        },
        required: ["path", "oldText", "newText"],
      },
    },
    async (args) => {
      const path = args.path as string;
      const oldText = args.oldText as string;
      const newText = args.newText as string;
      const replaceAll = args.replaceAll as boolean || false;

      const { data, error } = await supabase
        .from("project_files")
        .select("content")
        .eq("project_id", projectId).eq("path", path).maybeSingle();
      if (error) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error: error.message,
        };
      }
      if (!data) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error: `"${path}" não encontrado`,
        };
      }

      const current = data.content as string;
      if (!current.includes(oldText)) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error:
            `Texto não encontrado em "${path}". Use fs_read para ver o conteúdo atual.`,
        };
      }

      let edited: string;
      let count: number;
      if (replaceAll) {
        edited = current.split(oldText).join(newText);
        count = current.split(oldText).length - 1;
      } else {
        edited = current.replace(oldText, newText);
        count = 1;
      }

      const { error: writeErr } = await supabase.from("project_files").upsert({
        project_id: projectId,
        path,
        content: edited,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,path" });

      if (writeErr) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error: writeErr.message,
        };
      }
      corpusCapture(ctx, path, edited, "agent_edit");
      // success path for fs_edit: loop emits file_diff(pre-capture) + preview_sync + tick (unconditional, live during first-gen seed + follow-ups)
      return {
        toolCallId: "",
        ok: true,
        output: `${count} substituição(ões) em "${path}"`,
        artifacts: [path],
      };
    },
  );

  // ─── fs_read_many: leitura em lote com glob (como read_multiple_files do Command Code) ───
  reg.register(
    {
      name: "fs_read_many",
      description:
        `Lê VÁRIOS arquivos de uma vez usando glob pattern. Muito mais eficiente que chamar fs_read várias vezes.

Exemplos:
- pattern: "src/**/*.tsx" → lê todos os TSX do src
- pattern: "*.json" → lê todos os JSON da raiz
- pattern: "src/components/*.tsx" → todos os componentes

Retorna um objeto com { files: [{ path, content }] }.
Arquivos muito grandes (>10KB) têm conteúdo truncado. Use fs_read individual para arquivos específicos grandes.`,
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern (ex: 'src/**/*.tsx', '*.json')",
          },
          maxFiles: {
            type: "number",
            description: "Máximo de arquivos a ler. Padrão: 20. Máx: 50",
          },
        },
        required: ["pattern"],
      },
    },
    async (args) => {
      const pattern = args.pattern as string;
      const maxFiles = Math.min((args.maxFiles as number) || 20, 50);

      const { data, error } = await supabase
        .from("project_files")
        .select("path, content")
        .eq("project_id", projectId);

      if (error) {
        return {
          toolCallId: "",
          ok: false,
          output: null,
          error: error.message,
        };
      }

      const matched = (data ?? [] as FileEntry[])
        .filter((f: FileEntry) => globMatch(pattern, f.path))
        .slice(0, maxFiles);

      const files = matched.map((f: FileEntry) => ({
        path: f.path,
        content: (f.content ?? "").length > 10240
          ? (f.content ?? "").slice(0, 10240) +
            `\n... [truncado, ${f.content.length} bytes totais]`
          : f.content,
      }));

      return {
        toolCallId: "",
        ok: true,
        output: { count: files.length, files },
      };
    },
  );
}
