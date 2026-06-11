/** Expectativas humanas por passo — paridade com supabase/functions/_shared/step-intent.ts */

function fileBase(path: unknown): string {
  const p = String(path ?? "").replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p || "arquivo";
}

export function describeStepExpectation(name: string, args: Record<string, unknown> = {}): string {
  const path = String(args.path ?? args.filePath ?? args.file ?? "");
  const base = fileBase(path);

  switch (name) {
    case "fs_read":
    case "fs_read_many":
      if (/package\.json|vite\.config|tsconfig/i.test(path)) {
        return "Entender a configuração do projeto antes de alterar";
      }
      if (/App\.tsx|main\.tsx|index\.html/i.test(path)) {
        return "Ler o ponto de entrada da aplicação";
      }
      return path ? `Consultar ${base} antes de alterar` : "Ler arquivos do projeto";
    case "fs_list":
    case "fs_glob":
      return "Mapear a estrutura de arquivos do projeto";
    case "fs_search":
      return `Buscar no código por «${String(args.regex ?? args.query ?? "…").slice(0, 40)}»`;
    case "fs_write":
      return path ? `Criar ou sobrescrever ${base}` : "Criar novo arquivo";
    case "fs_edit":
      if (/\.(css|scss)$/i.test(path)) return `Ajustar estilos em ${base}`;
      if (/Hero|Landing|page|index|App/i.test(path)) return `Construir a interface em ${base}`;
      return path ? `Implementar mudanças em ${base}` : "Editar arquivo do projeto";
    case "shell_exec": {
      const cmd = String(args.command ?? "").toLowerCase();
      if (/vitest|npm test|pnpm test/.test(cmd)) return "Validar que os testes passam";
      if (/build|vite build/.test(cmd)) return "Verificar se o projeto compila";
      if (/typecheck|tsc/.test(cmd)) return "Checar erros de TypeScript";
      if (/npm install|pnpm install/.test(cmd)) return "Instalar dependências necessárias";
      return "Executar comando no ambiente do projeto";
    }
    case "web_search":
      return "Pesquisar referências na web";
    case "web_fetch":
      return "Buscar documentação relevante";
    default:
      return `Avançar com ${name.replace(/_/g, " ")}`;
  }
}

export function buildPhaseTaskTitle(phase: string, message?: string): string {
  const m = (message ?? "").trim();
  if (m && !/^lendo arquivos|classificando|verificando/i.test(m)) return m;

  switch (phase) {
    case "gather":
      return "Entender o que já existe no projeto";
    case "classify":
      return "Avaliar o escopo da tarefa";
    case "plan":
      return "Montar plano de implementação";
    case "build":
    case "execute":
      return "Implementar as mudanças pedidas";
    case "observe":
      return "Verificar se o build passa";
    case "summarize":
      return "Finalizar e entregar";
    case "resume":
      return "Retomar de onde parou";
    default:
      return m || "Trabalhar no seu pedido";
  }
}

export function extractStepFilePaths(name: string, args: Record<string, unknown> = {}): string[] {
  const path = String(args.path ?? args.filePath ?? args.file ?? "").trim();
  if (path && name.startsWith("fs_")) return [path];
  return [];
}
