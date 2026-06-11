// plan-mode.test.ts — Testes do buildProposedPlan (Fase 4.6+: plano rico)
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  buildPlanChatMessageText,
  buildProposedPlan,
  extractRationaleFromLlmContent,
  isShowExistingPlanRequest,
  sanitizePlanHeadline,
} from "./plan-mode.ts";

const opts = { planId: "p1", ttlMs: 5 * 60 * 1000, proposedAt: "2026-06-06T00:00:00Z" };

Deno.test("buildProposedPlan: caminho 1 — classification.plan do LLM estruturado", () => {
  const plan = buildProposedPlan(
    {
      type: "new_project",
      summary: "Vou criar X",
      plan: {
        rationale: "Abordagem pensada",
        steps: [
          {
            id: "s1",
            type: "create_file",
            description: "Criar arquivo A",
            filePath: "a.ts",
            enabled: true,
          },
          {
            id: "s2",
            type: "edit_file",
            description: "Editar arquivo B",
            filePath: "b.ts",
            enabled: true,
          },
        ],
      },
    },
    null,
    opts,
  );
  assertEquals(plan.steps.length, 2);
  assertEquals(plan.rationale, "Abordagem pensada");
  assertEquals(plan.summary, "Vou criar X");
});

Deno.test(
  "buildProposedPlan: caminho 2 — extrai do rawContent quando classification.plan ausente",
  () => {
    const raw = JSON.stringify({
      complexity: 3,
      type: "modify",
      summary: "Ajuste X",
      plan: {
        rationale: "Do raw",
        steps: [{ id: "s1", type: "edit_file", description: "Editar Y", filePath: "y.ts" }],
      },
    });
    const plan = buildProposedPlan({ type: "modify", summary: "Ajuste X" }, raw, opts);
    assertEquals(plan.steps.length, 1);
    assertEquals(plan.rationale, "Do raw");
  },
);

Deno.test(
  "buildProposedPlan: caminho 3 — sem LLM estruturado, usa deriveDefaultPlan + rationale genérico",
  () => {
    const plan = buildProposedPlan(
      { type: "new_project", summary: "Criar landing page" },
      null,
      opts,
    );
    assertEquals(plan.steps.length, 5, "new_project tem 5 passos default");
    assertExists(plan.rationale);
    assert(plan.rationale!.includes("heurística"), "rationale default deve mencionar heurística");
  },
);

Deno.test("buildProposedPlan: rationale vazio vira undefined", () => {
  const plan = buildProposedPlan(
    {
      type: "modify",
      summary: "x",
      plan: {
        rationale: "",
        steps: [{ id: "s1", type: "custom", description: "d", enabled: true }],
      },
    },
    null,
    opts,
  );
  assertEquals(plan.rationale, undefined);
});

Deno.test("extractRationaleFromLlmContent: parseia {plan:{rationale,steps[]}}", () => {
  const raw = JSON.stringify({
    plan: { rationale: "r", steps: [{ type: "custom", description: "d" }] },
  });
  const r = extractRationaleFromLlmContent(raw);
  assertExists(r);
  assertEquals(r!.rationale, "r");
  assertEquals(r!.steps.length, 1);
});

Deno.test("extractRationaleFromLlmContent: retorna null se plan não tem steps", () => {
  const raw = JSON.stringify({ plan: { rationale: "r", steps: [] } });
  const r = extractRationaleFromLlmContent(raw);
  assertEquals(r, null);
});

Deno.test("extractRationaleFromLlmContent: retorna null se JSON inválido", () => {
  assertEquals(extractRationaleFromLlmContent("não é json"), null);
  assertEquals(extractRationaleFromLlmContent(""), null);
  assertEquals(extractRationaleFromLlmContent(null), null);
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

Deno.test("buildPlanChatMessageText não repete template antigo", () => {
  const text = buildPlanChatMessageText({
    planId: "p1",
    summary: "App de voz",
    mission: "App de voz",
    steps: [{ id: "s1", type: "custom", description: "x", enabled: true }],
    ttlMs: 300000,
  });
  assert(text.includes("painel ao lado"));
  assert(!text.includes("Abri o **plano completo**"));
});
