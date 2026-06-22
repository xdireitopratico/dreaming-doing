import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  finishClarify,
  finishPlanModeFailure,
  resolvePlanModeNoToolsResponse,
  type PlanTurnFinishDeps,
} from "./plan-turn.ts";

function mockFinishDeps(overrides?: Partial<PlanTurnFinishDeps>): PlanTurnFinishDeps & {
  events: Array<{ type: string; data: unknown }>;
  persisted: string[];
} {
  const events: Array<{ type: string; data: unknown }> = [];
  const persisted: string[] = [];
  return {
    runId: "run-1",
    projectId: "proj-1",
    llmResponseWasStreamed: false,
    emit: (type, data) => events.push({ type, data }),
    configuredModel: () => {
      throw new Error("not used");
    },
    persistFinal: async (summary) => {
      persisted.push(summary);
    },
    persistPlanFinal: async () => {},
    clearCheckpoint: async () => {},
    emitTransition: async () => {},
    events,
    persisted,
    ...overrides,
  };
}

Deno.test("finishPlanModeFailure — emite assistant_text e ok:false", async () => {
  const deps = mockFinishDeps();
  const result = await finishPlanModeFailure(deps, "Falhou", 2, ["fs_read"], "Falhou");
  assertEquals(result.ok, false);
  assertEquals(result.error, "Falhou");
  assertEquals(deps.events[0].type, "assistant_text");
  assertEquals(deps.persisted[0], "Falhou");
});

Deno.test("finishClarify — rejeita mensagem vazia", async () => {
  const deps = mockFinishDeps();
  const result = await finishClarify(deps, "  ", 1, []);
  assertEquals(result.ok, false);
  assertEquals(deps.events.length, 0);
});

Deno.test("finishClarify — awaiting clarify", async () => {
  const deps = mockFinishDeps();
  const result = await finishClarify(deps, "Qual o tom da marca?", 1, ["clarify"]);
  assertEquals(result.ok, true);
  assertEquals(result.awaiting, true);
  assertEquals((result.awaitingUser as { type: string }).type, "clarify");
});

Deno.test("resolvePlanModeNoToolsResponse — conversational", () => {
  const resolution = resolvePlanModeNoToolsResponse({
    assistantText: "Posso ajudar com isso.",
    llmResponseWasStreamed: false,
  });
  assertEquals(resolution.kind, "conversational");
  if (resolution.kind === "conversational") {
    assertEquals(resolution.text, "Posso ajudar com isso.");
  }
});

Deno.test("resolvePlanModeNoToolsResponse — stream_empty", () => {
  const resolution = resolvePlanModeNoToolsResponse({
    assistantText: "",
    llmResponseWasStreamed: true,
  });
  assertEquals(resolution.kind, "stream_empty");
});