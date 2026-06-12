import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAgentContextForLlm,
  buildExecuteInstruction,
  extractOriginalUserRequest,
  isPreviewActionRequest,
  isProjectInventoryQuestion,
  isProjectSeedPlaceholder,
  isSeedPlaceholderAppContent,
  looksLikeInteractionOnly,
  projectEntryPathFromFiles,
  resolveAllocateSandbox,
  SEED_CONTEXT_FOR_LLM,
} from "./qualify.ts";

Deno.test("extractOriginalUserRequest ignora mensagem de plano aprovado", () => {
  const req = extractOriginalUserRequest([
    { role: "user", content: "Crie uma landing de café" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "Plano aprovado — executar em modo Build." },
    {
      role: "user",
      content: "[Plano aprovado] Plano aprovado — executar em modo Build:\n• Hero",
    },
  ]);
  assertEquals(req, "Crie uma landing de café");
});

Deno.test("extractOriginalUserRequest ignora retomada e ruído", () => {
  const req = extractOriginalUserRequest([
    { role: "user", content: "Crie uma landing de café" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "[Retomar] Continue" },
    { role: "user", content: "Checkpoint salvo — use Continuar" },
  ]);
  assertEquals(req, "Crie uma landing de café");
});

Deno.test("buildExecuteInstruction inclui pedido literal", () => {
  const text = buildExecuteInstruction("Adicione botão azul no hero");
  assertEquals(text.includes("Adicione botão azul no hero"), true);
  assertEquals(text.includes("fs_write"), true);
});

Deno.test("preview action não é conversa vaga", () => {
  assertEquals(isPreviewActionRequest("envia para o preview"), true);
  assertEquals(looksLikeInteractionOnly("envia para o preview"), false);
  const instr = buildExecuteInstruction("envia para o preview");
  assertEquals(instr.includes("shell_exec"), true);
});

Deno.test("variantes de preview action", () => {
  const samples = [
    "mostra no preview",
    "atualiza o preview",
    "sincroniza preview",
    "manda pro preview",
  ];
  for (const s of samples) {
    assertEquals(isPreviewActionRequest(s), true);
    assertEquals(looksLikeInteractionOnly(s), false);
  }
});

Deno.test("pergunta de inventário detectada", () => {
  assertEquals(isProjectInventoryQuestion("o que temos pronto no projeto?"), true);
});

Deno.test("projectEntryPathFromFiles expo vs web", () => {
  assertEquals(projectEntryPathFromFiles([{ path: "app.json", content: "{}" }]), "app/index.tsx");
  assertEquals(projectEntryPathFromFiles([{ path: "src/App.tsx", content: "x" }]), "src/App.tsx");
});

Deno.test("isProjectSeedPlaceholder expo entry", () => {
  assertEquals(
    isProjectSeedPlaceholder([
      { path: "app.json", content: "{}" },
      { path: "app/index.tsx", content: "Canvas vazio — descreva" },
    ]),
    true,
  );
  assertEquals(
    isProjectSeedPlaceholder([
      { path: "app.json", content: "{}" },
      { path: "app/index.tsx", content: "export default function Home() {}" },
    ]),
    false,
  );
});

Deno.test("isSeedPlaceholderAppContent detecta canvas vazio", () => {
  assertEquals(isSeedPlaceholderAppContent("export default () => <p>Canvas vazio</p>"), true);
  assertEquals(
    isSeedPlaceholderAppContent("export default function App() { return <Hero/> }"),
    false,
  );
});

Deno.test(
  "extractOriginalUserRequest landing + approve(with meta) + short follow-up 'add X' returns follow-up",
  () => {
    const req = extractOriginalUserRequest([
      { role: "user", content: "Crie uma landing de café com hero" },
      { role: "assistant", content: "Plano proposto..." },
      {
        role: "user",
        content: "[Plano aprovado] Plano aprovado — executar em modo Build:\n• Hero",
        meta: { kind: "plan_approved", planSourceRunId: "run-plan-123" },
      },
      { role: "user", content: "add X" },
    ]);
    assertEquals(req, "add X");
  },
);

Deno.test(
  "extractOriginalUserRequest prefers meta.kind=plan_approved even without prefix in content",
  () => {
    const req = extractOriginalUserRequest([
      { role: "user", content: "landing" },
      {
        role: "user",
        content: "Segue o plano abaixo.",
        meta: { kind: "plan_approved", planSourceRunId: "r1" },
      },
      { role: "user", content: "add dark mode" },
    ]);
    assertEquals(req, "add dark mode");
  },
);

Deno.test(
  "extractOriginalUserRequest prefers meta.planSourceRunId over string heuristics",
  () => {
    const req = extractOriginalUserRequest([
      { role: "user", content: "landing" },
      {
        role: "user",
        content: "ok",
        meta: { planSourceRunId: "r1" },
      },
      { role: "user", content: "add dark mode" },
    ]);
    assertEquals(req, "add dark mode");
  },
);

Deno.test(
  "extractOriginalUserRequest with mixed history returns planSummary equiv for pure approve (no followup)",
  () => {
    const req = extractOriginalUserRequest([
      { role: "user", content: "landing de cafeteria" },
      {
        role: "user",
        content: "[Plano aprovado] Segue o plano abaixo.\nFazer X",
        meta: { kind: "plan_approved", planSourceRunId: "r42" },
      },
    ]);
    assertEquals(req, "landing de cafeteria");
  },
);

Deno.test("resolveAllocateSandbox: plan mode nunca aloca", () => {
  assertEquals(
    resolveAllocateSandbox({
      planMode: true,
      userContent: "Crie uma landing completa com hero e formulário",
      projectHasSandbox: true,
    }),
    false,
  );
});

Deno.test("resolveAllocateSandbox: conversa vaga sem sandbox não aloca", () => {
  assertEquals(
    resolveAllocateSandbox({
      userContent: "quero conversar sobre a ideia",
      projectHasSandbox: false,
    }),
    false,
  );
});

Deno.test("resolveAllocateSandbox: plano aprovado força alocação", () => {
  assertEquals(
    resolveAllocateSandbox({
      userContent: "oi",
      projectHasSandbox: false,
      hasApprovedPlanInHistory: true,
    }),
    true,
  );
});

Deno.test("buildAgentContextForLlm mascara seed como scaffold da plataforma", () => {
  const ctx = buildAgentContextForLlm(
    [{ path: "src/App.tsx", content: "export default () => <p>Canvas vazio</p>" }],
    "### package.json\n```\nreact 19\n```",
    "  package.json\n  src/App.tsx",
  );
  assertEquals(ctx.projectConfig, SEED_CONTEXT_FOR_LLM);
  assertEquals(ctx.manifest.includes("seed"), true);
});