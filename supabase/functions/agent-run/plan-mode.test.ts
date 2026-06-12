// plan-mode.test.ts — Helpers de plan mode + plano persistido (create_plan vive em meta.ts)
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { proposedPlanFromToolArgs } from "./tools/meta.ts";
import {
  buildPlanDocumentMarkdown,
  extractStoredPlanFromMessageMeta,
  findLatestStoredPlan,
  generatePlanChatMessage,
  filterActionablePlanSteps,
  isActionablePlanStep,
  buildPlanModeTurnInstruction,
  isExplicitPlanProposalRequest,
  isShowExistingPlanRequest,
  PLAN_MODE_CREATE_PLAN_NUDGE,
  sanitizePlanHeadline,
  validateApprovedSteps,
} from "./plan-mode.ts";
import type { ChatMessage } from "./types.ts";

Deno.test("proposedPlanFromToolArgs (meta) monta documento via helpers de plan-mode", () => {
  const plan = proposedPlanFromToolArgs({
    summary: "Landing de padaria",
    rationale: "Começar pela home.",
    mission: "Landing de padaria",
    steps: [
      { id: "s1", type: "observe", description: "Ler contexto" },
      { id: "s2", type: "create_file", description: "Criar hero", filePath: "src/App.tsx" },
    ],
  });
  assertEquals(plan?.summary, "Landing de padaria");
  assertEquals(plan?.steps.length, 2);
  assert(plan?.markdown?.includes("## Princípio (sua regra)"));
  assert(plan?.phases?.length);
});

Deno.test("sanitizePlanHeadline bloqueia meta-comentário do classify", () => {
  assertEquals(
    sanitizePlanHeadline("Conversa: o usuário pede um plano anterior", "Fallback"),
    "Fallback",
  );
  assertEquals(sanitizePlanHeadline("Landing de cafeteria", "Fallback"), "Landing de cafeteria");
});

Deno.test("isShowExistingPlanRequest detecta pedido de reabrir plano", () => {
  assertEquals(isShowExistingPlanRequest("mostra o plano"), true);
  assertEquals(isShowExistingPlanRequest("criar landing"), false);
});

Deno.test("isExplicitPlanProposalRequest detecta pedido formal de plano", () => {
  assertEquals(isExplicitPlanProposalRequest("usa a tool create plan"), true);
  assertEquals(isExplicitPlanProposalRequest("plano em fases do projeto"), true);
  assertEquals(isExplicitPlanProposalRequest("monte um plano para a landing"), true);
  assertEquals(isExplicitPlanProposalRequest("mostra o plano"), false);
  assertEquals(isExplicitPlanProposalRequest("bom dia"), false);
});

Deno.test("buildPlanModeTurnInstruction anexa nudge create_plan quando explícito", () => {
  const out = buildPlanModeTurnInstruction("usa a tool create plan");
  assert(out.includes("usa a tool create plan"));
  assert(out.includes(PLAN_MODE_CREATE_PLAN_NUDGE));
  assertEquals(buildPlanModeTurnInstruction("bom dia"), "bom dia");
});

Deno.test("isActionablePlanStep rejeita passos meta-conversacionais", () => {
  assertEquals(isActionablePlanStep("Pedir ao usuário o conteúdo do plano"), false);
  assertEquals(isActionablePlanStep("Criar apps/hermes-voice-app com Expo"), true);
  const filtered = filterActionablePlanSteps([
    { id: "s1", type: "custom", description: "Pedir ao usuário colar plano", enabled: true },
    { id: "s2", type: "create_file", description: "Criar App.tsx", enabled: true },
  ]);
  assertEquals(filtered.length, 1);
  assertEquals(filtered[0]?.description, "Criar App.tsx");
});

Deno.test("buildPlanDocumentMarkdown gera fases a partir dos steps", () => {
  const doc = buildPlanDocumentMarkdown({
    summary: "App mobile",
    rationale: "Expo primeiro.",
    steps: [
      { id: "s1", type: "observe", description: "Ler projeto", enabled: true },
      { id: "s2", type: "create_file", description: "Scaffold Expo", enabled: true },
    ],
  });
  assert(doc.markdown.includes("## Princípio (sua regra)"));
  assert(doc.markdown.includes("## Entregas"));
  assertEquals(doc.phases.length >= 1, true);
});

Deno.test("extractStoredPlanFromMessageMeta e findLatestStoredPlan", () => {
  const messages: ChatMessage[] = [
    {
      role: "assistant",
      meta: {
        planId: "p-old",
        planSummary: "Plano antigo",
        planSteps: [{ id: "s1", type: "custom", description: "Antigo", enabled: true }],
        planStatus: "approved",
      },
    },
    {
      role: "assistant",
      meta: {
        planId: "p-new",
        planSummary: "Plano novo",
        planSteps: [
          { id: "s1", type: "custom", description: "Novo passo 1", enabled: true },
          { id: "s2", type: "custom", description: "Novo passo 2", enabled: true },
        ],
        planStatus: "pending",
      },
    },
  ];
  const latest = findLatestStoredPlan(messages);
  assertEquals(latest?.plan.planId, "p-new");
  assertEquals(latest?.status, "pending");
  const one = extractStoredPlanFromMessageMeta(messages[0]?.meta);
  assertEquals(one?.planId, "p-old");
});

Deno.test("validateApprovedSteps preserva subset por id", () => {
  const original = [
    { id: "s1", type: "custom" as const, description: "A", enabled: true },
    { id: "s2", type: "custom" as const, description: "B", enabled: true },
  ];
  const ok = validateApprovedSteps(original, [
    { id: "s1", description: "A editado" },
    { id: "s2", enabled: false },
  ]);
  assertEquals(ok.ok, true);
  if (ok.ok) {
    assertEquals(ok.steps.length, 1);
    assertEquals(ok.steps[0]?.description, "A editado");
  }
  const bad = validateApprovedSteps(original, [{ id: "s9" }]);
  assertEquals(bad.ok, false);
});

Deno.test("generatePlanChatMessage — texto vem do LLM", async () => {
  const mock = {
    async chat() {
      return {
        role: "assistant" as const,
        content: "**App de voz** — revise o plano no painel ao lado e aprove quando estiver pronto.",
        tool_calls: [],
      };
    },
  };
  const text = await generatePlanChatMessage(mock, {
    planId: "p1",
    summary: "App de voz",
    mission: "App de voz",
    steps: [{ id: "s1", type: "custom", description: "x", enabled: true }],
    ttlMs: 300000,
  });
  assert(text?.includes("painel ao lado"));
  assert(!text?.includes("Abri o **plano completo**"));
});