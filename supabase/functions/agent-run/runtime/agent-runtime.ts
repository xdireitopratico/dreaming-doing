// runtime/agent-runtime.ts — Entry point do loop com lifecycle (Fase 2.3)
import { AgentLoop } from "../loop.ts";
import type { AgentLoopRunResult } from "./loop-result.ts";
import type { AgentState, LLMProvider } from "../types.ts";
import type { ToolRegistry } from "../registry.ts";
import type { StreamCallback } from "./emitter.ts";
import type { AgentLoopOptions } from "./loop-options.ts";

export type RouterOverrides = { main?: LLMProvider; cheap?: LLMProvider };

export type AgentRuntimeCreateInput = {
  reg: ToolRegistry;
  llm: LLMProvider;
  supabase: unknown;
  state: AgentState;
  onStream?: StreamCallback;
  injectedKeys?: Record<string, string>;
  routerOverrides?: RouterOverrides;
  robinActive?: boolean;
  projectTemplate?: string;
  stackAddon?: string;
  options?: AgentLoopOptions;
};

/** Fachada fina sobre AgentLoop — heartbeat + run(). */
export class AgentRuntime {
  private readonly loop: AgentLoop;

  constructor(input: AgentRuntimeCreateInput) {
    this.loop = new AgentLoop(
      input.reg,
      input.llm,
      input.supabase,
      input.state,
      input.onStream ?? (() => {}),
      input.injectedKeys,
      input.routerOverrides,
      input.robinActive ?? false,
      input.projectTemplate ?? "vite-react",
      input.stackAddon ?? "",
      input.options,
    );
  }

  /** Acesso direto ao loop (testes / escape hatch). */
  getLoop(): AgentLoop {
    return this.loop;
  }

  async run(heartbeatIntervalMs = 30_000): Promise<AgentLoopRunResult> {
    this.loop.startHeartbeatTimer(heartbeatIntervalMs);
    try {
      return await this.loop.run();
    } finally {
      this.loop.stopHeartbeatTimer();
    }
  }
}

export function createAgentRuntime(input: AgentRuntimeCreateInput): AgentRuntime {
  return new AgentRuntime(input);
}