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

/** Narração ao explorar o projeto (gather) — só mini card, sem contagem. */
export function buildGatherNarration(_totalFiles?: number, _paths?: string[]): string {
  return "Explorando o projeto…";
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

export type ResolveFinalChatOpts = FinalWrapUpOpts & {
  /** Texto já produzido pelo LLM durante a run (stream/narração). */
  narration?: string;
};

export type ResolvedFinalChat = {
  text: string;
  /** Texto extra a emitir além do que já foi streamado. */
  emitExtra: boolean;
  extraText?: string;
};

function mentionsDelivery(text: string): boolean {
  return /preview|arquivo|alterei|entreguei|confere|mexi em|pronto —/i.test(text);
}

function buildDeliveryClosing(fileCount: number, paths: string[]): string {
  const shown = paths.slice(-3).map((p) => `\`${p}\``).join(", ");
  const extra = fileCount > 3 ? ` e mais ${fileCount - 3}` : "";
  if (fileCount === 1) {
    return `Mexi em ${shown} — confere o preview. Quer refinar algo?`;
  }
  return `Entreguei em **${fileCount} arquivos** (${shown}${extra}). Dá uma olhada no preview; se quiser ajustar, é só falar.`;
}

function buildPartialClosing(fileCount: number, paths: string[]): string {
  if (fileCount === 0) {
    return "Até aqui — continuo na próxima rodada. Quer priorizar algo específico?";
  }
  const shown = paths.slice(-2).map((p) => `\`${p}\``).join(", ");
  return `Até aqui mexi em ${shown}${fileCount > 2 ? ` (+${fileCount - 2})` : ""}. Posso seguir quando quiser.`;
}

/**
 * Mensagem final do chat — conversa do LLM em primeiro lugar; zero template robótico.
 * «Pronto! Resumo do que fiz» e «Nenhum arquivo alterado» foram removidos de propósito.
 */
export function resolveFinalChatMessage(opts: ResolveFinalChatOpts): ResolvedFinalChat {
  const narration = opts.narration?.trim() ?? "";
  const fileCount = opts.touchedPaths.length;

  if (opts.errorMessage?.trim()) {
    const err = opts.errorMessage.trim();
    return narration && !narration.includes(err.slice(0, 24))
      ? { text: `${narration}\n\n${err}`, emitExtra: true, extraText: err }
      : { text: err, emitExtra: !narration };
  }

  if (opts.silentResume) {
    const note = fileCount > 0
      ? "Ainda estou trabalhando — já deixei parte do pedido pronta."
      : "Ainda estou trabalhando no seu pedido.";
    if (narration) return { text: narration, emitExtra: false };
    return { text: note, emitExtra: true };
  }

  if (opts.partial) {
    const note = buildPartialClosing(fileCount, opts.touchedPaths);
    if (narration) {
      return { text: `${narration}\n\n${note}`, emitExtra: true, extraText: note };
    }
    return { text: note, emitExtra: true };
  }

  if (fileCount === 0) {
    if (narration) return { text: narration, emitExtra: false };
    return {
      text: "Me conta o que você quer construir ou ajustar — estou aqui pra ajudar.",
      emitExtra: true,
    };
  }

  const deliveryNote = buildDeliveryClosing(fileCount, opts.touchedPaths);
  if (narration) {
    if (mentionsDelivery(narration)) {
      return { text: narration, emitExtra: false };
    }
    return {
      text: `${narration}\n\n${deliveryNote}`,
      emitExtra: true,
      extraText: deliveryNote,
    };
  }
  return { text: deliveryNote, emitExtra: true };
}

/** @deprecated Use resolveFinalChatMessage — mantido para testes legados. */
export function buildFinalWrapUp(opts: FinalWrapUpOpts): string {
  return resolveFinalChatMessage({ ...opts }).text;
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