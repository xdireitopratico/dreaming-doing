// narration.ts — Textos de checkpoint de comunicação (briefing + narração durante execução).
import type { ClassificationResult } from "./router.ts";
import type { PlanStep } from "./types.ts";

const INTENT_LABELS: Record<string, string> = {
  new_project: "criar algo novo no projeto",
  modify: "modificar o que já existe",
  fix: "corrigir um problema",
  add_dep: "adicionar dependências",
  other: "atender seu pedido",
};

type ToolCallLike = {
  name: string;
  arguments: Record<string, unknown>;
};

function fileBase(path: unknown): string {
  const p = String(path ?? "").replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p || "arquivo";
}

function describeTool(call: ToolCallLike): string {
  const args = call.arguments ?? {};
  switch (call.name) {
    case "fs_read":
      return `ler \`${String(args.path ?? "arquivo")}\``;
    case "fs_read_many":
      return `ler vários arquivos (${String(args.pattern ?? args.glob ?? "projeto")})`;
    case "fs_list":
      return "listar arquivos do projeto";
    case "fs_search":
      return `buscar «${String(args.regex ?? args.query ?? "…").slice(0, 48)}» no código`;
    case "fs_glob":
      return `encontrar arquivos (${String(args.pattern ?? "…")})`;
    case "fs_write":
      return `criar \`${String(args.path ?? "arquivo")}\``;
    case "fs_edit":
      return `editar \`${String(args.path ?? "arquivo")}\``;
    case "shell_exec": {
      const cmd = String(args.command ?? "").trim().slice(0, 56);
      return cmd ? `executar \`${cmd}\`` : "rodar comando no sandbox";
    }
    case "web_search":
      return "pesquisar na web";
    case "web_fetch":
      return "buscar documentação";
    default:
      return `usar ${call.name}`;
  }
}

/** Briefing pós-classify — o que o agente vai fazer antes de entrar no loop. */
export function buildClassifyBriefing(
  classification: ClassificationResult,
  opts: { maxSteps: number; planMode: boolean; approvedPlan?: boolean },
): string {
  const intent = INTENT_LABELS[classification.type] ?? INTENT_LABELS.other;
  const summary = classification.summary?.trim() || "Implementar seu pedido";
  const lines: string[] = [];

  if (opts.approvedPlan) {
    lines.push("**Plano aprovado** — vou executar passo a passo o que combinamos.");
  } else if (opts.planMode) {
    lines.push("Vou montar um **plano** para você revisar antes de qualquer código.");
  } else {
    lines.push(`Entendi: vou **${intent}**.`);
  }

  lines.push("", summary);

  const plan = classification.plan;
  if (!opts.planMode && plan?.steps?.length) {
    const enabled = plan.steps.filter((s) => s.enabled !== false).slice(0, 6);
    if (enabled.length > 0) {
      lines.push("", "**Caminho previsto:**");
      for (const step of enabled) {
        lines.push(`- ${step.description}`);
      }
      if (plan.steps.length > enabled.length) {
        lines.push(`- _…e mais ${plan.steps.length - enabled.length} passo(s)_`);
      }
    }
  }

  if (!opts.planMode) {
    lines.push(
      "",
      "Vou ler o projeto, implementar as mudanças e validar o resultado.",
    );
  }

  return lines.join("\n").trim();
}

/** Narração ao explorar o projeto (gather). */
export function buildGatherNarration(totalFiles: number, paths: string[]): string {
  if (totalFiles === 0) {
    return "O projeto está vazio — vou começar pela estrutura base (config, entrada e primeiro componente).";
  }
  if (paths.length === 0) {
    return `Encontrei **${totalFiles} arquivo${totalFiles === 1 ? "" : "s"}** — vou mapear a estrutura antes de alterar qualquer coisa.`;
  }
  const shown = paths.slice(0, 5).map((p) => `\`${p}\``).join(", ");
  const extra = paths.length > 5 ? ` e mais ${paths.length - 5}` : "";
  return `Explorando o projeto (${totalFiles} arquivo${totalFiles === 1 ? "" : "s"})…`;
}

/** Briefing quando o build vem de plano aprovado. */
export function buildApprovedPlanBriefing(planSummary: string, steps?: PlanStep[]): string {
  const lines = ["**Executando plano aprovado.**", ""];
  const summary = planSummary.trim();
  if (summary) lines.push(summary);

  const enabled = (steps ?? []).filter((s) => s.enabled !== false);
  if (enabled.length > 0) {
    lines.push("", "**Passos aprovados:**");
    for (const step of enabled.slice(0, 8)) {
      lines.push(`- ${step.description}`);
    }
    if (enabled.length > 8) {
      lines.push(`- _…e mais ${enabled.length - 8} passo(s)_`);
    }
  }

  lines.push("", "Começando a implementar agora.");
  return lines.join("\n").trim();
}

/** Atualização curta após um lote de ferramentas. */
export function buildToolBatchNarration(
  calls: ToolCallLike[],
  opts?: { step?: number; total?: number; allOk?: boolean },
): string | null {
  if (!calls.length) return null;

  const parts = calls.map(describeTool);
  const unique = [...new Set(parts)];
  const joined =
    unique.length <= 3
      ? unique.join(", ")
      : `${unique.slice(0, 2).join(", ")} e mais ${unique.length - 2} ação(ões)`;

  const prefix =
    opts?.step && opts?.total
      ? `**Passo ${opts.step}/${opts.total}** — `
      : "";

  const status =
    opts?.allOk === false
      ? "Algumas ações falharam; vou ajustar e seguir."
      : "Próximo: continuar implementando com base no que encontrei.";

  return `${prefix}Concluí: ${joined}. ${status}`;
}

export type FinalWrapUpOpts = {
  stepsCompleted: number;
  totalSteps: number;
  touchedPaths: string[];
  toolsUsed: string[];
  resumable?: boolean;
  partial?: boolean;
  errorMessage?: string;
  /** Pausa interna (auto-resume) — sem pedir ação ao usuário. */
  silentResume?: boolean;
};

/** Wrap-up final — resumo honesto do que foi entregue. */
export function buildFinalWrapUp(opts: FinalWrapUpOpts): string {
  const lines: string[] = [];
  const fileCount = opts.touchedPaths.length;

  if (opts.errorMessage?.trim()) {
    lines.push(opts.errorMessage.trim());
  } else if (opts.silentResume) {
    if (fileCount > 0) {
      lines.push("Ainda estou trabalhando — já deixei parte do pedido pronta.");
    } else {
      lines.push("Ainda estou trabalhando no seu pedido.");
    }
  } else if (opts.partial) {
    lines.push("**Até aqui:**");
  } else {
    lines.push("**Pronto!** Resumo do que fiz:");
  }

  if (fileCount > 0) {
    const shown = opts.touchedPaths.slice(-8).map((p) => `\`${p}\``).join(", ");
    const extra = fileCount > 8 ? ` e mais ${fileCount - 8}` : "";
    lines.push(
      "",
      fileCount === 1
        ? `Alterei **1 arquivo**: ${shown}.`
        : `Alterei **${fileCount} arquivos**: ${shown}${extra}.`,
    );
  } else if (!opts.errorMessage && !opts.silentResume) {
    lines.push("", "Nenhum arquivo foi alterado nesta rodada.");
  }

  const tools = [...new Set(opts.toolsUsed)].filter(Boolean);
  if (tools.length > 0 && !opts.silentResume) {
    lines.push("", `Ferramentas usadas: ${tools.slice(0, 6).join(", ")}${tools.length > 6 ? "…" : ""}.`);
  }

  if (!opts.silentResume && !opts.errorMessage && !opts.partial && fileCount > 0) {
    lines.push("", "Confira o **preview** à direita — se algo faltar, descreva o próximo ajuste.");
  }

  return lines.join("\n").trim();
}

/** Narração curta para validação/observe. */
export function buildObserveNarration(kind: "typecheck" | "build" | "stuck" | "validate_ok"): string {
  switch (kind) {
    case "typecheck":
      return "Encontrei erros de TypeScript — vou corrigir antes de seguir.";
    case "build":
      return "Verificando se o projeto compila e o build passa…";
    case "stuck":
      return "Percebi repetição nas mesmas ações — vou mudar de abordagem.";
    case "validate_ok":
      return "Build OK — seguindo para o próximo passo.";
  }
}