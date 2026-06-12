import type { AgentProgress } from "@/lib/agent-progress";

const PHASE_LABELS: Record<string, string> = {
  plan: "Montando um plano",
  build: "Implementando as mudanças",
  execute: "Implementando as mudanças",
  observe: "Verificando se tudo compila",
  summarize: "Finalizando a resposta",
  resume: "Retomando execução",
  taste: "Concierge",
  taste_chat: "Concierge",
  done: "Concluído",
};

const TOOL_LABELS: Record<string, (args?: Record<string, unknown>) => string> = {
  fs_read: (a) => `Lendo ${String(a?.path ?? "arquivo")}…`,
  fs_read_many: (a) => {
    const pattern = String(a?.pattern ?? a?.glob ?? "").trim();
    return pattern ? `Lendo arquivos (${pattern})…` : "Lendo vários arquivos…";
  },
  fs_list: () => "Listando arquivos do projeto…",
  fs_search: (a) => `Buscando «${String(a?.regex ?? a?.query ?? "…").slice(0, 40)}»…`,
  fs_glob: (a) => `Buscando ${String(a?.pattern ?? "arquivos")}…`,
  fs_write: (a) => `Criando ${String(a?.path ?? "arquivo")}…`,
  fs_edit: (a) => `Editando ${String(a?.path ?? "arquivo")}…`,
  shell_exec: (a) => {
    const cmd = String(a?.command ?? "").slice(0, 48);
    return cmd ? `Executando: ${cmd}…` : "Executando comando no sandbox…";
  },
  web_search: () => "Pesquisando na web…",
  web_fetch: () => "Buscando documentação…",
};

export type AgentNarrative = {
  /** Linha principal — o que o FORGE está fazendo agora (sempre visível durante run). */
  headline: string | null;
  /** Texto conversacional do modelo (stream ou resposta). */
  body: string | null;
  /** true quando o agente está ativo mas ainda não há texto — mostrar pulso/typing. */
  showTyping: boolean;
  /** Hint secundário (rate limit, fila, retomada). */
  subhint: string | null;
};

function activeToolLabel(progress: AgentProgress): string | null {
  const active = progress.tools.filter((t) => t.ok === undefined);
  const last = active[active.length - 1];
  if (!last) return null;
  const fn = TOOL_LABELS[last.name];
  return fn ? fn(last.args) : `Usando ${last.name}…`;
}

/**
 * Camada de comunicação humano↔LLM — estados nomeados + streaming.
 * Separada dos "Detalhes" técnicos (timeline/tools).
 */
export function buildAgentNarrative(
  progress: AgentProgress,
  opts?: { running?: boolean; persistedText?: string | null },
): AgentNarrative {
  const running = opts?.running ?? !progress.finished;
  const body = (progress.streamText?.trim() || null) ?? (opts?.persistedText?.trim() || null);

  if (!running) {
    return {
      headline: null,
      body,
      showTyping: false,
      subhint: progress.statusHint,
    };
  }

  const queueHint =
    progress.pendingQueueCount > 0
      ? `${progress.pendingQueueCount} mensagem${progress.pendingQueueCount > 1 ? "ns" : ""} na fila`
      : null;

  const connecting =
    !progress.phase &&
    !progress.streamText?.trim() &&
    /conectando|iniciando|na fila/i.test(progress.statusHint ?? "");

  const toolLine = activeToolLabel(progress);
  const phaseLine = progress.phase
    ? progress.message?.trim() || PHASE_LABELS[progress.phase] || progress.phase
    : null;

  const headline =
    (connecting ? progress.statusHint?.trim() : null) ??
    phaseLine ??
    toolLine ??
    progress.message?.trim() ??
    progress.statusHint ??
    "Trabalhando no seu pedido…";

  const subhint =
    queueHint ??
    (toolLine && phaseLine && phaseLine !== headline ? phaseLine : progress.statusHint);

  return {
    headline,
    body,
    showTyping: running && !body && !progress.awaiting,
    subhint: subhint && subhint !== headline ? subhint : null,
  };
}
