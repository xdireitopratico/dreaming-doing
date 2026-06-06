// types.ts — Core types model-agnostic para o loop do agente
// Deno-compatible (Supabase Edge Functions)

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  ok: boolean;
  output: unknown;
  error?: string;
  artifacts?: string[];
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface ChatParams {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | string;
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" } | { type: "text" };
}

export type ChatContentBlock = {
  type: string;
  text?: string;
  image_url?: { url: string };
};

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | ChatContentBlock[];
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface ChatResponse {
  role: "assistant";
  content: string | null;
  tool_calls: ToolCall[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
  };
}

export interface LLMProvider {
  chat(params: ChatParams): Promise<ChatResponse>;
}

export interface FileEntry {
  id: string;
  path: string;
  content: string;
  updated_at: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ExecOpts {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface SandboxProvider {
  sync(projectId: string, files: FileEntry[]): Promise<void>;
  exec(command: string, opts?: ExecOpts): Promise<ExecResult>;
  getPreviewUrl(port: number): Promise<string>;
  destroy(): Promise<void>;
}

export interface ActionPlan {
  title: string;
  steps: string[];
  affectedFiles: string[];
}

export interface IntentAnalysis {
  type: "new_project" | "modify" | "fix" | "add_dep" | "other";
  scope: string[];
  complexity: "simple" | "medium" | "complex";
  summary: string;
}

export type PlanStepType =
  | "create_file"
  | "edit_file"
  | "shell_exec"
  | "install_dep"
  | "observe"
  | "custom";

export interface PlanStep {
  id: string;
  type: PlanStepType;
  description: string;
  filePath?: string;
  estimatedCost?: number;
  enabled: boolean;
}

export interface ProposedPlan {
  planId: string;
  summary: string;
  steps: PlanStep[];
  ttlMs: number;
  /** Decisão do cliente (preenchida quando aprovada/rejeitada). */
  decision?: { action: "approve"; steps: PlanStep[] } | { action: "reject"; reason?: string };
  /** ISO timestamp em que o plano foi proposto. */
  proposedAt: string;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  output: string;
  error?: string;
}

export interface AgentContext {
  files: FileEntry[];
  manifest: string;
  projectConfig: string;
  gitLog: string;
  dbSchema: string;
  lastPlan: string;
}

export interface AgentState {
  projectId: string;
  conversationId: string;
  userId: string;
  messages: ChatMessage[];
  phase: LoopPhase;
  currentStepIndex: number;
  context: AgentContext | null;
  intent: IntentAnalysis | null;
  plan: ActionPlan | null;
  validationResults: CheckResult[];
  executionLog: string[];
  retryFeedback: string | null;
  totalSteps: number;
  /** Plano pendente aguardando aprovação do usuário (Fase 4.6 plan mode). */
  pendingPlan?: ProposedPlan | null;
}

export enum LoopPhase {
  GATHER_CONTEXT = "gather_context",
  ANALYZE_INTENT = "analyze_intent",
  CREATE_PLAN = "create_plan",
  EXECUTE_STEP = "execute_step",
  VALIDATE_STEP = "validate_step",
  DECIDE_NEXT = "decide_next",
  SUMMARIZE = "summarize",
  DONE = "done",
  ERROR = "error",
}

export interface ProjectRecord {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  description?: string;
}

export interface MessageRecord {
  id: string;
  conversation_id: string;
  role: string;
  parts: Array<{ type: string; text?: string }>;
  tool_calls: Array<{ name: string; args: Record<string, unknown> }>;
  created_at: string;
}
