// runtime/loop-options.ts — Opções do AgentLoop (Fase 2.3)
import type { AgentPreferencesPayload } from "../connector-keys.ts";
import type { ProviderConfig } from "../providers.ts";
import type { DesignPlanField, LoopPhase, PlanStep } from "../types.ts";

export type AgentLoopOptions = {
  maxSteps?: number;
  tasteStart?: boolean;
  sessionAddon?: string;
  userSkillNames?: string[];
  resumeRun?: boolean;
  hasCheckpoint?: boolean;
  resumePhase?: LoopPhase | null;
  complexityScore?: number;
  maxStepsFromCheckpoint?: number;
  runId?: string | null;
  planMode?: boolean;
  chatMode?: boolean;
  approvedPlanBuild?: boolean;
  skipConversationalGate?: boolean;
  planSummary?: string;
  planHeadline?: string;
  planSteps?: PlanStep[];
  approvedPlanDesign?: DesignPlanField;
  buildFixResume?: boolean;
  /** CI smoke — sem preflight pesado nem auto-resolve de design. */
  smokeRun?: boolean;
  resolvedMainCfg?: ProviderConfig;
  preferences?: AgentPreferencesPayload;
};