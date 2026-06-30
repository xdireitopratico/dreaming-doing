import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enrichProposedPlanDesign } from "../../plan-design-enrich.ts";
import { proposedPlanFromToolArgs } from "../../tools/meta.ts";
import {
  finishClarify,
  finishPlanModeFailure,
  createPlanModeTokenHandler,
  resolvePlanModeNoToolsResponse,
  type PlanModeStreamState,
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

Deno.test("resolvePlanModeNoToolsResponse — explicit plan without create_plan falha fechado", () => {
  const resolution = resolvePlanModeNoToolsResponse({
    assistantText: "Posso ajudar com isso.",
    llmResponseWasStreamed: false,
    mustUseCreatePlan: true,
  });
  assertEquals(resolution.kind, "hard_failure");
  if (resolution.kind === "hard_failure") {
    assert(resolution.error.includes("create_plan"));
  }
});

Deno.test("resolvePlanModeNoToolsResponse — markdown de plano sem create_plan falha fechado", () => {
  const resolution = resolvePlanModeNoToolsResponse({
    assistantText:
      "## Missão\nConstruir uma landing page completa para uma padaria artesanal.\n\n" +
      "## Fases\n1. Explorar o projeto e o contexto atual.\n2. Propor a solução final.\n3. Validar a entrega com critérios objetivos.",
    llmResponseWasStreamed: false,
    mustUseCreatePlan: true,
  });
  assertEquals(resolution.kind, "hard_failure");
});

Deno.test("plan-turn — create_plan UI sem design recebe enrich", () => {
  const proposed = proposedPlanFromToolArgs({
    summary: "Landing padaria artesanal",
    markdown: "## Plano\nHero e cardápio.",
    steps: [{ description: "Hero editorial com grain" }, { description: "Seção cardápio" }],
  });
  assert(proposed);
  const enriched = enrichProposedPlanDesign(
    proposed,
    "padaria artesanal premium",
    "vite-react",
  );
  assert(enriched.design?.voice?.length);
  assert(enriched.design?.moment?.trim());
  assert((enriched.design?.read_paths?.length ?? 0) >= 2);
  assert((enriched.design?.compositions?.length ?? 0) >= 1);
});

Deno.test("resolvePlanModeNoToolsResponse — stream_empty", () => {
  const resolution = resolvePlanModeNoToolsResponse({
    assistantText: "",
    llmResponseWasStreamed: true,
  });
  assertEquals(resolution.kind, "stream_empty");
});

Deno.test("createPlanModeTokenHandler — não duplica pensamento", () => {
  const events: Array<{ type: string; data: unknown }> = [];
  const state: PlanModeStreamState = {
    llmResponseWasStreamed: false,
    thinkingStreamStartedAt: null,
  };
  const handler = createPlanModeTokenHandler(state, (type, data) => events.push({ type, data }), () => {});

  handler("vou montar o plano");

  assertEquals(state.llmResponseWasStreamed, true);
  assertEquals(events.length, 0);
});
