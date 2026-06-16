import type { ChatMessage } from "@/lib/chat-types";
import type { AgentProgress } from "@/lib/agent-progress";

export type RunPhase = "plan" | "build" | "execute" | "observe" | "summarize" | "resume" | null;

export type TaskStatus = "pending" | "active" | "done" | "failed";

export type TaskItem = {
  id: string;
  label: string;
  status: TaskStatus;
};

export type MiniCardStatus = "thinking" | "working" | "done" | "failed";

export type MiniCardData = {
  title: string;
  /** Header Lovable: «Edited App.tsx», «Running command», «Plan ready». */
  header: string;
  /** Subtitle rotativo — briefing da tarefa ativa. */
  subtitle: string;
  liveBriefings: string[];
  status: MiniCardStatus;
  tasks: TaskItem[];
  currentTaskIndex: number;
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

export type ClarifyChoice = {
  label: string;
  description?: string;
};

export type ClarifyPrompt = {
  intro?: string;
  question?: string;
  choices: ClarifyChoice[];
};

/** @deprecated Use ClarifyChoice */
export type QualifyChoice = ClarifyChoice;
/** @deprecated Use ClarifyPrompt */
export type QualifyPrompt = ClarifyPrompt;

export type ThreadItem =
  | { kind: "user"; message: ChatMessage }
  | {
      kind: "assistant";
      message?: ChatMessage;
      runId: string;
      isActive: boolean;
      streamText: string | null;
      phase?: RunPhase;
      phaseMessage?: string | null;
      thinking?: {
        active: boolean;
        startedAtMs?: number;
        durationMs?: number;
        connectionState?: "connected" | "reconnecting" | "disconnected";
      } | null;
      narration?: string | null;
      miniCard?: MiniCardData | null;
      statusChips?: string[];
      clarify?: ClarifyPrompt | null;
      error?: string | null;
      finished?: boolean;
      lastFinishOk?: boolean;
      resumable?: boolean;
      isFocused?: boolean;
    };

/** Item interno antes do mapeamento para UI. */
export type RawThreadItem =
  | { kind: "user"; message: ChatMessage; internal?: boolean }
  | {
      kind: "assistant";
      message?: ChatMessage;
      runId?: string;
      isActive: boolean;
      live?: AgentProgress;
    };

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