import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatClarifyMessage,
  getMetaToolDefinitions,
  hasMixedMetaAndExecution,
  mergeExecutionToolDefinitions,
  mergePlanModeToolDefinitions,
  PLAN_MODE_PATCH_TOOLS,
  META_CLARIFY_KIND,
  META_PLAN_KIND,
  proposedPlanFromToolArgs,
  registerMetaTools,
  splitMetaToolCalls,
} from "./meta.ts";
import { ToolRegistry } from "../registry.ts";

Deno.test("formatClarifyMessage monta markdown com opções", () => {
  const text = formatClarifyMessage({
    intro: "Entendi um app mobile.",
    question: "Qual stack prefere?",
    choices: [
      { label: "Expo", description: "Preview rápido" },
      { label: "Kotlin" },
    ],
  });
  assertEquals(text.includes("Qual stack prefere?"), true);
  assertEquals(text.includes("**Expo**"), true);
  assertEquals(text.includes("**Kotlin**"), true);
});

Deno.test("formatClarifyMessage fallback sem args úteis", () => {
  assertEquals(formatClarifyMessage({}), "");
});

Deno.test("proposedPlanFromToolArgs exige 2-7 passos", () => {
  const plan = proposedPlanFromToolArgs({
    summary: "Landing de padaria",
    rationale: "Começar pela home.",
    steps: [
      { id: "s1", type: "observe", description: "Ler contexto" },
      { id: "s2", type: "create_file", description: "Criar hero", filePath: "src/App.tsx" },
    ],
  });
  assertEquals(plan?.summary, "Landing de padaria");
  assertEquals(plan?.steps.length, 2);
  assertEquals(proposedPlanFromToolArgs({ summary: "x", steps: [] }), null);
  assertEquals(
    proposedPlanFromToolArgs({
      summary: "x",
      steps: [{ description: "único passo" }],
    }),
    null,
  );
  assertEquals(
    proposedPlanFromToolArgs({
      summary: "x",
      steps: Array.from({ length: 8 }, (_, i) => ({
        description: `passo ${i + 1}`,
      })),
    }),
    null,
  );
});

Deno.test("getMetaToolDefinitions e registerMetaTools respeitam planMode", () => {
  assertEquals(getMetaToolDefinitions(false).map((d) => d.name), ["clarify"]);
  assertEquals(getMetaToolDefinitions(true).map((d) => d.name), ["clarify", "create_plan"]);
  const reg = new ToolRegistry();
  registerMetaTools(reg, { planMode: false });
  assertEquals(reg.getDefinitions().some((d) => d.name === "create_plan"), false);
  const regPlan = new ToolRegistry();
  registerMetaTools(regPlan, { planMode: true });
  assertEquals(regPlan.getDefinitions().some((d) => d.name === "create_plan"), true);
});

Deno.test("registerMetaTools handlers retornam kind meta", async () => {
  const reg = new ToolRegistry();
  registerMetaTools(reg, { planMode: true });
  const clarify = await reg.execute({
    id: "c1",
    name: "clarify",
    arguments: { question: "Qual stack?" },
  });
  assertEquals((clarify.output as Record<string, unknown>).kind, META_CLARIFY_KIND);
  const plan = await reg.execute({
    id: "p1",
    name: "create_plan",
    arguments: {
      summary: "App",
      steps: [{ description: "Ler" }, { description: "Criar" }],
    },
  });
  assertEquals((plan.output as Record<string, unknown>).kind, META_PLAN_KIND);
});

Deno.test("splitMetaToolCalls e hasMixedMetaAndExecution", () => {
  const clarifyCall = { id: "1", name: "clarify", arguments: { question: "?" } };
  const planCall = { id: "2", name: "create_plan", arguments: { summary: "x", steps: [] } };
  const execCall = { id: "3", name: "fs_write", arguments: { path: "a.tsx", content: "x" } };

  const split = splitMetaToolCalls([clarifyCall, execCall]);
  assertEquals(split.clarify?.name, "clarify");
  assertEquals(split.execution.length, 1);
  assertEquals(hasMixedMetaAndExecution([clarifyCall, ...split.execution]), true);
  assertEquals(hasMixedMetaAndExecution([clarifyCall]), false);
  assertEquals(hasMixedMetaAndExecution([planCall, execCall]), true);
  assertEquals(hasMixedMetaAndExecution(undefined), false);
});

Deno.test("mergePlanModeToolDefinitions — mantém extract_design_dna (H39)", () => {
  const merged = mergePlanModeToolDefinitions([
    { name: "fs_read", description: "r", parameters: { type: "object", properties: {} } },
    { name: "extract_design_dna", description: "dna", parameters: { type: "object", properties: {} } },
    { name: "fs_write", description: "w", parameters: { type: "object", properties: {} } },
  ]);
  assertEquals(merged.some((d) => d.name === "extract_design_dna"), true);
});

Deno.test("mergePlanModeToolDefinitions oculta patch e mantém shell", () => {
  const merged = mergePlanModeToolDefinitions([
    { name: "fs_read", description: "r", parameters: { type: "object", properties: {} } },
    { name: "fs_write", description: "w", parameters: { type: "object", properties: {} } },
    { name: "fs_edit", description: "e", parameters: { type: "object", properties: {} } },
    { name: "shell_exec", description: "s", parameters: { type: "object", properties: {} } },
  ]);
  assertEquals(merged.some((d) => d.name === "fs_read"), true);
  assertEquals(merged.some((d) => d.name === "shell_exec"), true);
  assertEquals(merged.some((d) => d.name === "clarify"), true);
  assertEquals(merged.some((d) => d.name === "create_plan"), true);
  for (const hidden of PLAN_MODE_PATCH_TOOLS) {
    assertEquals(merged.some((d) => d.name === hidden), false);
  }
});

Deno.test("proposedPlanFromToolArgs persiste design com compositions e read_paths", () => {
  const plan = proposedPlanFromToolArgs({
    summary: "Landing SaaS",
    markdown: "## Plano",
    steps: [{ description: "Hero editorial" }, { description: "Seção features" }],
    design: {
      voice: ["swiss", "editorial"],
      moment: "Hero cinematic com spotlight",
      techniques: ["parallax-depth", "scroll-reveal"],
      compositions: ["hero-cinematic-spotlight"],
      composition_exports: ["HeroCinematicSpotlight"],
      read_paths: ["packages/forge-ui/src/compositions/opinionated/HeroCinematicSpotlight.tsx"],
    },
  });
  assertEquals(plan?.design?.compositions, ["hero-cinematic-spotlight"]);
  assertEquals(plan?.design?.read_paths?.length, 1);
});

Deno.test("CREATE_PLAN_TOOL schema expõe design", () => {
  const defs = getMetaToolDefinitions(true);
  const createPlan = defs.find((d) => d.name === "create_plan");
  const props = (createPlan?.parameters as { properties?: Record<string, unknown> })?.properties;
  assertEquals(typeof props?.design, "object");
});

Deno.test("mergeExecutionToolDefinitions deduplica meta tools", () => {
  const merged = mergeExecutionToolDefinitions(
    [
      { name: "fs_read", description: "r", parameters: { type: "object", properties: {} } },
      { name: "clarify", description: "c", parameters: { type: "object", properties: {} } },
      { name: "create_plan", description: "p", parameters: { type: "object", properties: {} } },
    ],
    true,
  );
  assertEquals(merged.filter((d) => d.name === "clarify").length, 1);
  assertEquals(merged.filter((d) => d.name === "create_plan").length, 1);
  assertEquals(merged.some((d) => d.name === "fs_read"), true);
});