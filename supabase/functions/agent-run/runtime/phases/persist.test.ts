import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CHECKPOINT_INTERVAL_STEPS,
  persistFinal,
  saveCheckpoint,
  type AgentPersistDeps,
} from "./persist.ts";
import type { AgentState } from "../../types.ts";
import { LoopPhase } from "../../types.ts";

function mockPersistDeps(overrides?: Partial<AgentPersistDeps>): AgentPersistDeps & {
  upserts: unknown[];
  inserts: unknown[];
  updates: unknown[];
} {
  let lastCheckpointStep = 0;
  const upserts: unknown[] = [];
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const state: AgentState = {
    projectId: "proj-1",
    conversationId: "conv-1",
    messages: [],
    phase: LoopPhase.GATHER_CONTEXT,
    currentStepIndex: 4,
    executionLog: [],
  };
  const sb = {
    from(table: string) {
      return {
        upsert(row: unknown) {
          if (table === "agent_checkpoints") upserts.push(row);
          return Promise.resolve();
        },
        insert(row: unknown) {
          inserts.push(row);
          return Promise.resolve();
        },
        update(row: unknown) {
          updates.push(row);
          return {
            eq: () => Promise.resolve(),
          };
        },
      };
    },
  };
  return {
    sb,
    runId: "run-1",
    state,
    getLastRunMessageId: () => null,
    setLastRunMessageId: () => {},
    getMaxStepsLimit: () => 60,
    getComplexityScore: () => 3,
    touchedPaths: new Set(),
    narrationBuffer: "",
    tailSlice: () => [],
    getTimeline: () => [],
    runStartTime: Date.now() - 1000,
    getLastCheckpointStep: () => lastCheckpointStep,
    setLastCheckpointStep: (step) => {
      lastCheckpointStep = step;
    },
    emit: () => {},
    loopBudgetMs: 600_000,
    upserts,
    inserts,
    updates,
    ...overrides,
  };
}

Deno.test("CHECKPOINT_INTERVAL_STEPS — intervalo de 2 steps", () => {
  assertEquals(CHECKPOINT_INTERVAL_STEPS, 2);
});

Deno.test("saveCheckpoint — pula quando intervalo não atingido", async () => {
  const deps = mockPersistDeps();
  deps.state.currentStepIndex = 3;
  deps.setLastCheckpointStep(2);
  await saveCheckpoint(deps, LoopPhase.GATHER_CONTEXT);
  assertEquals(deps.upserts.length, 0);
});

Deno.test("saveCheckpoint — grava com force=true", async () => {
  const deps = mockPersistDeps();
  deps.state.currentStepIndex = 3;
  deps.setLastCheckpointStep(2);
  await saveCheckpoint(deps, LoopPhase.GATHER_CONTEXT, true);
  assertEquals(deps.upserts.length, 1);
});

Deno.test("persistFinal — insere mensagem quando não há run message existente", async () => {
  const deps = mockPersistDeps();
  await persistFinal(deps, "Concluído!");
  assertEquals(deps.inserts.length, 1);
  assertEquals(deps.updates.length, 1);
  const row = deps.inserts[0] as { parts: Array<{ text: string }>; meta: Record<string, unknown> };
  assertEquals(row.parts[0].text, "Concluído!");
  assertEquals(row.meta.lastFinishOk, true);
  assertEquals(row.meta.partial, false);
});