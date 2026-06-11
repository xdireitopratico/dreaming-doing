export type ChatRole = "user" | "assistant" | "tool";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  runId?: string;
  meta?: Record<string, unknown>;
  timestamp: number;
};

export type ChatStatus = "idle" | "running" | "error";

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

export type ErrorSeverity = "info" | "warning" | "error";

export type ErrorHint = {
  severity: ErrorSeverity;
  message: string;
  tip?: string;
  actionLabel?: string;
  actionUrl?: string;
  code?: string;
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
      qualify?: QualifyPrompt | null;
      plan?: PlanPrompt | null;
      planStatus?: "pending" | "approved" | "rejected" | null;
      error?: string | null;
      finished?: boolean;
      lastFinishOk?: boolean;
      resumable?: boolean;
      conversationId?: boolean;
    };

export type ChatState = {
  status: ChatStatus;
  runId: string | null;
  streamText: string | null;
  error: string | null;
  phase?: RunPhase;
  phaseMessage?: string | null;
  thinking?: { active: boolean; startedAtMs: number; durationMs?: number } | null;
  narration?: string | null;
  tasks?: TaskItem[];
  currentTaskIndex?: number;
  editedFile?: string | null;
  fileCount?: number;
  hasPlan?: boolean;
  planReady?: boolean;
  plan?: PlanPrompt | null;
  planStatus?: "pending" | "approved" | "rejected" | null;
  qualify?: QualifyPrompt | null;
  finished?: boolean;
  lastFinishOk?: boolean;
  resumable?: boolean;
  conversationId?: boolean;
};

export const INITIAL_CHAT_STATE: ChatState = {
  status: "idle",
  runId: null,
  streamText: null,
  error: null,
};
