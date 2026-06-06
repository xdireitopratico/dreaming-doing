import type { ToolIconName } from "@/components/ui/tool-icons";

export interface ToolLabel {
  label: string;
  icon: ToolIconName;
  category: "file" | "shell" | "code" | "deploy" | "other";
}

export const TOOL_LABELS: Record<string, ToolLabel> = {
  fs_read: { label: "Ler arquivo", icon: "FileText", category: "file" },
  fs_write: { label: "Criar arquivo", icon: "FilePlus", category: "file" },
  fs_edit: { label: "Editar arquivo", icon: "FileEdit", category: "file" },
  fs_list: { label: "Listar arquivos", icon: "FolderOpen", category: "file" },
  fs_glob: { label: "Buscar arquivos", icon: "Search", category: "file" },
  fs_delete: { label: "Excluir arquivo", icon: "Trash2", category: "file" },
  shell: { label: "Executar comando", icon: "Terminal", category: "shell" },
  shell_bg: { label: "Comando em background", icon: "TerminalSquare", category: "shell" },
  apply_patch: { label: "Aplicar patch", icon: "GitMerge", category: "code" },
  read_tool: { label: "Leitura", icon: "BookOpen", category: "code" },
  write_tool: { label: "Escrita", icon: "PenTool", category: "code" },
  edit_tool: { label: "Edição", icon: "Edit3", category: "code" },
  task_tool: { label: "Sub-agente", icon: "Bot", category: "code" },
  grep_tool: { label: "Buscar no código", icon: "Search", category: "code" },
  glob_tool: { label: "Buscar arquivos", icon: "Glob", category: "code" },
  list_tool: { label: "Listar diretório", icon: "List", category: "file" },
  deploy_publish: { label: "Publicar projeto", icon: "Globe", category: "deploy" },
  deploy_preview: { label: "Preview deploy", icon: "Eye", category: "deploy" },
  mcp_call: { label: "Chamada MCP", icon: "Plug", category: "other" },
  taste: { label: "Taste AI", icon: "Zap", category: "other" },
  connector_keys: { label: "Gerenciar chaves", icon: "Key", category: "other" },
  memory: { label: "Memória", icon: "Brain", category: "other" },
  web_fetch: { label: "Buscar na web", icon: "Globe", category: "other" },
  web_search: { label: "Pesquisar web", icon: "Search", category: "other" },
};

export function getToolLabel(name: string): ToolLabel {
  return TOOL_LABELS[name] ?? { label: name, icon: "Box", category: "other" };
}

export function getShortToolLabel(name: string): string {
  return TOOL_LABELS[name]?.label ?? name;
}

export function getToolCategory(name: string): string {
  return TOOL_LABELS[name]?.category ?? "other";
}

export function getToolIconName(name: string): ToolIconName {
  return (TOOL_LABELS[name]?.icon ?? "Box") as ToolIconName;
}