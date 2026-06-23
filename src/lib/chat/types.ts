import type { ChatMessage } from "@/lib/chat-types";
import type { AgentProgress } from "@/lib/agent-progress";
import type { PendingPlan } from "@/lib/agent-progress";
import type { ClarifyChoice as CanonicalClarifyChoice } from "@/lib/clarify-choices";

/** ClarifyChoice — fonte única de verdade em @/lib/clarify-choices.
 *  Reexportado aqui para conveniência dos consumers de chat/types. */
export type ClarifyChoice = CanonicalClarifyChoice;

export type RunPhase = "plan" | "build" | "execute" | "observe" | "summarize" | "resume" | null;

export type MiniCardStatus = "thinking" | "working" | "done" | "failed";

/** Activity stream — últimas ações reais do agente (tools/results/tasks)
 *  com status visual. Substitui o briefing único por 3-4 linhas humanizadas
 *  que mostram o trabalho happening em tempo real. */
export type ActivityStatus = "done" | "active" | "failed";

export type ActivityLine = {
  id: string;
  /** Título curto: "Editando App.tsx", "Executando npm build". */
  label: string;
  /** Subtítulo descritivo: path completo, contexto extra, output resumido. */
  description?: string;
  /** Nome do tool original: "fs_edit", "shell_exec" → ícone semântico no render. */
  toolName?: string;
  status: ActivityStatus;
};

export type MiniCardData = {
  title: string;
  /** Header Lovable: «Edited App.tsx», «Running command», «Plan ready». */
  header: string;
  /** Subtitle rotativo — briefing da tarefa ativa. */
  subtitle: string;
  liveBriefings: string[];
  status: MiniCardStatus;
  /** Activity stream humanizado — últimos 3-4 itens da timeline com status.
   *  Mostra trabalho happening em tempo real (vs briefing único raso). */
  activity: ActivityLine[];
  /** Task list for plan-driven mini cards (to match Lovable screenshots). */
  tasks?: Array<{ id: string; label: string; status: 'pending' | 'active' | 'done' | 'failed' }>;
  editedFile?: string | null;
  fileCount?: number;
  hasPlan?: boolean;
  /** Fase 2.2 — action chips: último tool executado vira chip clicável
   *  (Show file / Show diff / Show output / Show preview). */
  lastTool?: {
    name: string;
    path?: string;
    ok?: boolean;
  } | null;
};

export type ClarifyPrompt = {
  intro?: string;
  question?: string;
  choices: ClarifyChoice[];
};

/** Linha única no chat — só estado; raciocínio fica no inspector. */
export type ChatThinkingState =
  | { status: "active" }
  | { status: "done"; durationSec: number };

/** @deprecated Use ChatThinkingState — mantido para migração de testes legados. */
export type ChatWorkingState = ChatThinkingState;

/** @deprecated Use ChatThinkingState — texto de pensamento não vai ao chat. */
export type ChatThoughtState = ChatThinkingState;

export type ThreadItem =
  | { kind: "user"; message: ChatMessage }
  | {
      kind: "assistant";
      message?: ChatMessage;
      runId: string;
      isActive: boolean;
      streamText: string | null;
      phase?: RunPhase;
      narration?: string | null;
      miniCard?: MiniCardData | null;
      clarify?: ClarifyPrompt | null;
      error?: string | null;
      finished?: boolean;
      lastFinishOk?: boolean;
      resumable?: boolean;
      isFocused?: boolean;
      /** Uma linha: Pensando… → Pensou por Xs (mesma posição DOM). */
      thinking?: ChatThinkingState | null;
      runStartedAtMs?: number | null;
    }


/** Item interno antes do mapeamento para UI. */
export type RawThreadItem =
  | { kind: "user"; message: ChatMessage; internal?: boolean }
  | {
      kind: "assistant";
      message?: ChatMessage;
      runId?: string;
      isActive: boolean;
      live?: AgentProgress;
    }


export type BuildChatThreadOptions = {
  activeRunId?: string | null;
  running?: boolean;
  /** Inspector focado em run histórico — suprime overlay live divergente. */
  activeRunStartedAtMs?: number | null;
  pendingPlan?: import("@/lib/agent-progress").PendingPlan | null;
  sessionProgress: AgentProgress;
  focusedRunId?: string | null;
};

export type ChatLiveState = {
  activeRunId: string | null;
  progress: AgentProgress;
  running: boolean;
};
