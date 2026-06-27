/**
 * prometheusReducer — Centralizes pipeline state for FlowAgentBuilderView.
 * Phases: home → onboarding → boardroom → architecture_brief → building → review → builder → monitoring
 */
import type { BoardroomMessage, BoardroomPhase } from "./PrometheusBoardroom";

export type PrometheusUIPhase =
  | "home"
  | "onboarding"
  | "boardroom"
  | "architecture_brief"
  | "building"
  | "review"
  | "builder"
  | "monitoring";

export interface PrometheusPipelineState {
  phase: PrometheusUIPhase;
  launchPrompt: string;
  launchQualityModel: string;
  flowId: string | null;
  isHydrating: boolean;
  boardroomMessages: BoardroomMessage[];
  isStreaming: boolean;
  convergenceScore: number;
  currentRound: number;
  briefOutput: {
    objective?: string;
    audience?: string;
    tone?: string;
    nodes?: Array<{ id: string; type: string; label: string }>;
    edges?: Array<{ source: string; target: string }>;
    prompts?: Array<{ nodeId: string; preview: string }>;
    costEstimate?: number;
    genome?: string;
  } | null;
  reviewEdited: boolean;
}

export const initialPrometheusPipelineState: PrometheusPipelineState = {
  phase: "home",
  launchPrompt: "",
  launchQualityModel: "balanced",
  flowId: null,
  isHydrating: false,
  boardroomMessages: [],
  isStreaming: false,
  convergenceScore: 0,
  currentRound: 1,
  briefOutput: null,
  reviewEdited: false,
};

export type PrometheusAction =
  | { type: "SET_PHASE"; phase: PrometheusUIPhase }
  | { type: "SET_LAUNCH"; prompt: string; qualityModel: string }
  | { type: "SET_FLOW_ID"; flowId: string | null }
  | { type: "SET_HYDRATING"; value: boolean }
  | { type: "SET_BRIEF_OUTPUT"; data: PrometheusPipelineState["briefOutput"] }
  | { type: "SET_BOARDROOM"; messages: BoardroomMessage[]; convergenceScore?: number; currentRound?: number }
  | { type: "SET_STREAMING"; value: boolean }
  | { type: "RESET" }
  | { type: "MERGE"; payload: Partial<PrometheusPipelineState> };

export function prometheusReducer(
  state: PrometheusPipelineState,
  action: PrometheusAction,
): PrometheusPipelineState {
  switch (action.type) {
    case "SET_PHASE":
      return { ...state, phase: action.phase };
    case "SET_LAUNCH":
      return { ...state, launchPrompt: action.prompt, launchQualityModel: action.qualityModel };
    case "SET_FLOW_ID":
      return { ...state, flowId: action.flowId };
    case "SET_HYDRATING":
      return { ...state, isHydrating: action.value };
    case "SET_BRIEF_OUTPUT":
      return { ...state, briefOutput: action.data };
    case "SET_BOARDROOM":
      return {
        ...state,
        boardroomMessages: action.messages,
        convergenceScore: action.convergenceScore ?? state.convergenceScore,
        currentRound: action.currentRound ?? state.currentRound,
      };
    case "SET_STREAMING":
      return { ...state, isStreaming: action.value };
    case "RESET":
      return { ...initialPrometheusPipelineState };
    case "MERGE":
      return { ...state, ...action.payload };
    default:
      return state;
  }
}
