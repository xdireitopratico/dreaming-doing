/**
 * prometheus-types.ts — Shared types for Prometheus Builder
 * Phase P6: FSM types, events, session shape
 * 
 * CRITICAL: No hardcoded model IDs anywhere. The user's selected model
 * (quality_model from the power selector) flows through the entire pipeline.
 */

export type PrometheusPhase =
  | "discovery"
  | "clarification"
  | "planning"
  | "approval"
  | "building"
  | "testing"
  | "review"
  | "deploying"
  | "complete";

export type PrometheusIntent = "create" | "modify" | "diagnose" | "optimize";

export type AgentRole = "cortex" | "analyst" | "architect" | "scribe" | "sentinel" | "user";

export type BuildEventType =
  | "agent_speaking"
  | "phase_change"
  | "node_added"
  | "edge_added"
  | "clarification_needed"
  | "plan_ready"
  | "test_result"
  | "build_complete"
  | "error";

export interface BuildEvent {
  type: BuildEventType;
  agent: AgentRole;
  content?: string;
  phase: PrometheusPhase;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface RequirementSpec {
  objective: string;
  target_audience: string;
  channels: string[];
  integrations: string[];
  tone: string;
  domain: string;
  complexity: "low" | "medium" | "high";
  constraints: string[];
  tools_needed: string[];
  has_rag: boolean;
  auto_healing: boolean;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  options?: string[];
  required: boolean;
}

export interface ArchitecturePlan {
  genome_id: string;
  genome_name: string;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    config: Record<string, unknown>;
    model_id?: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    condition?: string;
  }>;
  estimated_cost_per_interaction: number;
  estimated_latency_ms: number;
  models_used: string[];
}

export interface BuildSession {
  id: string;
  user_id: string;
  intent: PrometheusIntent;
  phase: PrometheusPhase;
  /** The user-selected model from the power selector — used for ALL LLM calls */
  quality_model: string;
  messages: Array<{ role: string; content: string; timestamp: number }>;
  requirements: RequirementSpec | null;
  architecture: ArchitecturePlan | null;
  flow_definition: Record<string, unknown> | null;
  // BUG 95 FIX: Correct type to match actual usage
  prompts: Record<string, { system_prompt: string; description: string; temperature?: number }> | null;
  test_suite: Record<string, unknown> | null;
  test_results: Record<string, unknown> | null;
  target_flow_id: string | null;
  iterations: number;
  build_time_seconds: number | null;
  specialist_calls: Array<{ agent: string; action: string; timestamp: number }>;
  output_flow_id: string | null;
  success: boolean | null;
}

export type PrometheusSessionIntent = "approve" | "request_changes" | "reject_plan" | "halt";

export interface PrometheusRequest {
  action: "start" | "message" | "status" | "skip" | "summarize" | "physician" | "codex_report" | "codex_insights"
    | "approve" | "request_changes" | "reject_plan" | "halt";
  session_id?: string;
  message?: string;
  feedback?: string;
  briefing?: Record<string, unknown>;
  flow_id?: string;
  /** Session intent — "modify" for flow-builder vibe chat */
  intent?: PrometheusIntent;
  /** The user-selected model ID from the power selector */
  model_id?: string;
}

export interface PrometheusResponse {
  session_id: string;
  phase: PrometheusPhase;
  events: BuildEvent[];
  done: boolean;
}

// Phase transition rules
export const PHASE_TRANSITIONS: Record<PrometheusPhase, PrometheusPhase[]> = {
  discovery: ["clarification", "planning"],
  clarification: ["planning", "discovery"],
  planning: ["approval"],
  approval: ["building", "planning"],
  building: ["testing"],
  testing: ["review", "building"],
  review: ["deploying", "building"],
  deploying: ["complete"],
  complete: [],
};

export function canTransition(from: PrometheusPhase, to: PrometheusPhase): boolean {
  return PHASE_TRANSITIONS[from]?.includes(to) ?? false;
}
