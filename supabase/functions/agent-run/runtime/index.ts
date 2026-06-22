// runtime/index.ts — API pública do runtime decomposto (Fase 2.3)
export { createAgentRuntime, AgentRuntime, type AgentRuntimeCreateInput } from "./agent-runtime.ts";
export type { AgentLoopOptions } from "./loop-options.ts";
export type { AgentLoopRunResult } from "./loop-result.ts";
export { RuntimeEmitter, type StreamCallback } from "./emitter.ts";
export { readLoopBudgetMsFromRuntime } from "./loop-config.ts";
export { buildOrchestratorDeps, type LoopOrchestratorHost } from "./loop-orchestrator-deps.ts";
export {
  resolveLoopOriginalUserRequest,
  resolveMaxStepsLimit,
  resolveSkipConversationalGate,
} from "./loop-init.ts";