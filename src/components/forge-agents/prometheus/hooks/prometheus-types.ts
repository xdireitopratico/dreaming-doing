/**
 * Prometheus shared types — used across builder components
 * Extracted from usePrometheusChat for decoupling (ROADMAP-02 Fase 7)
 */

export type PrometheusPhase =
  | "discovery" | "clarification" | "planning" | "approval"
  | "building" | "testing" | "review" | "deploying" | "complete";

export interface PrometheusChatMessage {
  id: string;
  role: "user" | "prometheus";
  content: string;
  phase: PrometheusPhase;
  type?: "text" | "clarification" | "plan" | "review" | "build_step" | "error";
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type BuilderMode = "self-manager" | "auto-manager";
