// runtime/phases/execute-helpers.ts — Helpers puros do loop de build (Fase 2.2)
import type { ChatResponse, IntentAnalysis, ToolCall, ToolResult } from "../../types.ts";

export const READ_ONLY_TOOLS = [
  "fs_read",
  "fs_read_many",
  "fs_search",
  "fs_list",
  "fs_glob",
] as const;

export const NO_CONTENT_HARD_STOP = 5;
export const NO_CONTENT_NUDGE = 3;
export const EXECUTE_MAX_RETRIES = 3;
export const EXECUTE_MAX_LLM_RETRIES = 3;

export function isActionableIntent(type: IntentAnalysis["type"] | undefined): boolean {
  return (
    type === "modify" ||
    type === "new_project" ||
    type === "fix" ||
    type === "add_dep"
  );
}

export function computeForceTools(input: {
  forceToolsNext: boolean;
  toolsInvoked: boolean;
  actionableIntent: boolean;
  approvedPlanBuild: boolean;
  loopStep: number;
}): boolean {
  return (
    input.forceToolsNext ||
    (!input.toolsInvoked &&
      input.actionableIntent &&
      (input.approvedPlanBuild ? input.loopStep >= 1 : input.loopStep >= 2 && input.loopStep <= 4))
  );
}

export function computeNarrationOnlyStep(input: {
  forceToolsNext: boolean;
  toolsInvoked: boolean;
  loopStep: number;
  actionableIntent: boolean;
  approvedPlanBuild: boolean;
}): boolean {
  return (
    !input.forceToolsNext &&
    !input.toolsInvoked &&
    input.loopStep === 1 &&
    input.actionableIntent &&
    !input.approvedPlanBuild
  );
}

export type ReadOnlyTrackerUpdate = {
  consecutive: number;
  shouldNudge: boolean;
  shouldHardStop: boolean;
};

export function updateReadOnlyTracker(
  consecutive: number,
  response: ChatResponse,
  assistantText: string,
): ReadOnlyTrackerUpdate {
  const hasOnlyReadTools =
    response.tool_calls.length > 0 &&
    response.tool_calls.every((tc) =>
      (READ_ONLY_TOOLS as readonly string[]).includes(tc.name),
    );
  const hasNoContent = !assistantText;

  let next = consecutive;
  if (hasNoContent && hasOnlyReadTools) {
    next++;
  } else if (assistantText || !hasOnlyReadTools) {
    next = 0;
  }

  return {
    consecutive: next,
    shouldNudge: next === NO_CONTENT_NUDGE,
    shouldHardStop: next >= NO_CONTENT_HARD_STOP,
  };
}

export type FilePreDiff = {
  path: string;
  before: string;
  after: string;
  op: "write" | "edit";
};

export function computeFilePreDiff(
  call: ToolCall,
  cache: Map<string, string>,
): FilePreDiff | null {
  if (call.name !== "fs_write" && call.name !== "fs_edit") return null;
  const filePath = (call.arguments.path as string) ?? "";
  if (!filePath) return null;

  const before = cache.get(filePath) ?? "";
  let after = before;
  if (call.name === "fs_write") {
    after = (call.arguments.content as string) ?? "";
  } else {
    const oldText = (call.arguments.oldText as string) ?? "";
    const newText = (call.arguments.newText as string) ?? "";
    const replaceAll = call.arguments.replaceAll === true;
    if (!oldText) {
      after = before + newText;
    } else {
      after = replaceAll
        ? before.split(oldText).join(newText)
        : before.replace(oldText, newText);
    }
  }
  cache.set(filePath, after);
  return {
    path: filePath,
    before,
    after,
    op: call.name === "fs_write" ? "write" : "edit",
  };
}

export function buildStructuredToolContent(call: ToolCall, result: ToolResult): string {
  const raw = JSON.stringify(result);
  if (result.ok) return raw;

  const toolName = call.name;
  const args = call.arguments;
  const path = String(args.path ?? args.filePath ?? args.file ?? "");
  const errorMsg = String(result.error ?? "unknown error");
  const outputSample =
    typeof result.output === "string"
      ? result.output.slice(0, 200)
      : typeof result.output === "object"
        ? JSON.stringify(result.output).slice(0, 200)
        : "";

  const hints: string[] = [];
  if (toolName === "fs_write" || toolName === "fs_edit") {
    hints.push(
      `Verifique se o diretório de ${path ? path.split("/").slice(0, -1).join("/") : "destino"} existe antes de escrever.`,
    );
    hints.push("Use shell_exec com `mkdir -p` ou `test -d` para garantir o caminho.");
  } else if (toolName === "shell_exec") {
    const cmd = String(args.command ?? "").slice(0, 120);
    if (/npm (install|add)\b/.test(cmd)) {
      hints.push("Tente `npm install --legacy-peer-deps` ou limpe node_modules primeiro.");
    }
    if (/npx tsc/.test(cmd)) {
      hints.push("Verifique se tsconfig.json está correto e os tipos estão instalados.");
    }
    if (/npm run build/.test(cmd) && outputSample) {
      hints.push(`Build falhou: ${outputSample.slice(0, 120)}`);
    }
    if (!outputSample) {
      hints.push("Comando não produziu saída — verifique se o binário existe.");
    }
  } else if (toolName === "fs_search" || toolName === "fs_read") {
    hints.push(
      `O caminho ${path || "<vazio>"} pode não existir. Verifique com shell_exec + test -e.`,
    );
  }

  // Framing de falha — direto, prático, sem loop cognitivo. 3 cenários:
  //   1. Tool externa bloqueante (web/scrape/research/screenshot/mcp) → avisa + pergunta como avançar
  //   2. Tool local falhou mas pode continuar → entrega contraprestação, informa a falha
  //   3. Erro de build/typecheck → só empurra feedback técnico (fluxo próprio de correção)
  const isExternalLookup = /^(web_research|web_scrape|web_fetch|http_fetch|screenshot_capture|mcp_|extract_design_dna)$/.test(
    toolName,
  );
  const isLocalBuildNoise =
    toolName === "shell_exec" && /npm (run build|run tsc|test)/i.test(String(args.command ?? ""));

  let framing: string;
  if (isLocalBuildNoise) {
    // Cenário 3: feedback técnico cru, sem framing comportamental (build tem fluxo próprio).
    framing = hints.length > 0 ? hints.join(" ") : "";
  } else if (isExternalLookup) {
    // Cenário 1: tool externa falhou — pode ser bloqueante.
    framing =
      `A ferramenta ${toolName} falhou. ` +
      "Decida rápido: (a) se é essencial para o pedido, informe o usuário da falha e pergunte como ele quer avançar sem ela; " +
      "(b) se dá pra seguir sem, informe a falha brevemente e entregue o que conseguir com o restante. " +
      "Não pare só por causa desta falha.";
  } else {
    // Cenário 2: tool local falhou (fs/shell comum) — geralmente dá pra seguir.
    framing =
      `A ferramenta ${toolName} falhou, mas isso não impede o trabalho. ` +
      "Informe o usuário da falha se for relevante e continue produzindo valor com as outras ferramentas. " +
      "Não pare por causa deste erro.";
  }

  return JSON.stringify({
    ok: false,
    tool: toolName,
    error: errorMsg,
    ...(path ? { path } : {}),
    ...(outputSample ? { output: outputSample.slice(0, 500) } : {}),
    hint: hints.length > 0 ? hints.join(" ") : undefined,
    framing,
  });
}

export function shouldEnforceNoToolCalls(input: {
  forceTools: boolean;
  narrationOnlyStep: boolean;
  llmResponseWasStreamed: boolean;
  approvedPlanBuild: boolean;
  actionableIntent: boolean;
  toolsInvoked: boolean;
}): boolean {
  return (
    input.forceTools ||
    input.narrationOnlyStep ||
    input.llmResponseWasStreamed ||
    input.approvedPlanBuild ||
    (input.actionableIntent && !input.toolsInvoked)
  );
}

export function shouldSuggestStackFork(input: {
  path: string;
  projectTemplate: string;
  contextFiles: Array<{ path: string }>;
}): boolean {
  const hasGradleScaffold = input.contextFiles.some((f) =>
    /build\.gradle|settings\.gradle/i.test(f.path.replace(/^\//, "")),
  );
  return (
    !hasGradleScaffold &&
    (input.projectTemplate === "vite-react" || input.projectTemplate === "landing-page")
  );
}