import type { ChatMessage } from "@/lib/chat-types";
import type { AgentProgress } from "@/lib/agent-progress";

export type RunPhase = "classify" | "gather" | "plan" | "execute" | "observe" | "summarize" | null;

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
  planReady?: boolean;
};

export type QualifyChoice = {
  label: string;
  description?: string;
};

export type QualifyPrompt = {
  intro?: string;
  question?: string;
  choices: QualifyChoice[];
};

export type PlanStep = {
  id: string;
  type: string;
  description: string;
  enabled: boolean;
};

export type PlanPrompt = {
  planId: string;
  summary: string;
  mission?: string;
  objective?: string;
  steps: PlanStep[];
  runId: string;
};

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
      thinking?: { active: boolean; startedAtMs?: number; durationMs?: number } | null;
      narration?: string | null;
      miniCard?: MiniCardData | null;
      statusChips?: string[];
      planTeaser?: boolean;
      qualify?: QualifyPrompt | null;
      plan?: PlanPrompt | null;
      planStatus?: "pending" | "approved" | "rejected" | null;
      error?: string | null;
      finished?: boolean;
      lastFinishOk?: boolean;
      resumable?: boolean;
    };

/** Item interno antes do mapeamento para UI. */
export type RawThreadItem =
  | { kind: "user"; message: ChatMessage }
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