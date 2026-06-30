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
  reasoningEffort?: "low" | "medium" | "high";
  response_format?: { type: "json_object" } | { type: "text" };
  /** Quando definido, adapters compatíveis emitem deltas de texto durante a geração. */
  onTokenDelta?: (delta: string) => void;
  /** Quando definido, adapters compatíveis emitem deltas de RACIOCÍNIO (reasoning_content) — o trace real do modelo. */
  onReasoningDelta?: (delta: string) => void;
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
  /** Carries DB meta (e.g. { kind: "plan_approved", planSourceRunId }) for meta-aware extract/qualify in plan+follow-up flows. */
  meta?: Record<string, unknown>;
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
  /** Retorna URL do preview OU null se a sandbox ainda não foi alocada
   *  (1º shell_exec do run). E2B só nasce DEPOIS do agente criar arquivos. */
  getPreviewUrl(port: number): Promise<string | null>;
  destroy(): Promise<void>;
  kill(): Promise<void>;
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

export interface ForgePlanPhase {
  id: string;
  title: string;
  goal: string;
  tasks: string[];
}

export interface DesignReference {
  url: string;
  title?: string;
  screenshot_url?: string;
  screenshot_base64?: string;
  extracted_dna?: string;
}

export interface DesignPlanField {
  /** Linguagens visuais escolhidas (2-3 do léxico). */
  voice: string[];
  /** O gesto-memorável concreto — assinatura desta página. */
  moment: string;
  /** Técnicas do catálogo @forge/ui que servem à visão. */
  techniques: string[];
  /** Mood escolhido (do catálogo de 8 moods). */
  mood?: string;
  /** Referências visuais extraídas via web_research + web_scrape + screenshot_capture. */
  references?: DesignReference[];
  /** Anti-padrões verificados — o agente declara que está evitando. */
  anti_patterns?: string[];
  /** Reasoning da síntese — por que esta combinação serve ao domínio. */
  synthesis_reasoning?: string;
  /** Auto-cheque preenchido pelo agente (5 itens). */
  auto_check?: { id: string; answer: string; pass: boolean }[];
  /** DesignDNAs relevantes do catálogo (IDs). */
  relevant_dnas?: string[];
  /** IDs de composições opinionated (manifest). */
  compositions?: string[];
  /** Exports React das composições escolhidas. */
  composition_exports?: string[];
  /** Paths obrigatórios para fs_read antes do 1º patch UI. */
  read_paths?: string[];
  /** Queries sugeridas para web_research (síntese). */
  research_queries?: string[];
  /** Resumos compactos dos DNAs escolhidos (id → texto). */
  dna_summaries?: Record<string, string>;
}

export interface ProposedPlan {
  planId: string;
  summary: string;
  /** Justificativa amigável em PT-BR (1-2 frases) — exibida no UI acima dos passos. */
  rationale?: string;
  mission?: string;
  objective?: string;
  assumptions?: string[];
  outOfScope?: string[];
  phases?: ForgePlanPhase[];
  /** Documento markdown estilo Lovable (Missão, Objetivo, Fases, Fora do escopo). */
  markdown?: string;
  steps: PlanStep[];
  /** Direção de design — só preenchida quando o template tem UI (web/app). */
  design?: DesignPlanField;
  ttlMs: number;
  /** Decisão do cliente (preenchida quando aprovada/rejeitada). */
  decision?:
    | { action: "approve"; steps: PlanStep[] }
    | {
        action: "reject";
        reason?: string;
      };
  /** ISO timestamp em que o plano foi proposto. */
  proposedAt?: string;
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
}

export enum LoopPhase {
  GATHER_CONTEXT = "gather_context",
  /** Turno do agente em plan mode (create_plan tool — não é fase orchestrator). */
  PLAN_MODE = "create_plan",
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
