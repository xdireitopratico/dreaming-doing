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
} from "./run-context.ts";

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

Deno.test("buildExecuteInstruction passo 1 — abertura única", () => {
  const text = buildExecuteInstruction("landing oficina", { loopStep: 1 });
  assertEquals(text.includes("FASE 1"), true);
  assertEquals(text.includes("NÃO reconfirme"), false);
});

Deno.test("buildExecuteInstruction passo 2+ — proíbe reconfirmar", () => {
  const text = buildExecuteInstruction("landing oficina", { loopStep: 2 });
  assertEquals(text.includes("NÃO reconfirme"), true);
  assertEquals(text.includes("confirmando o que entendeu"), false);
  assertEquals(text.includes("FASE 2..N"), true);
  assertEquals(text.includes("Content vazio"), true);
});

Deno.test("buildExecuteInstruction passo 1 — contrato FASE 4 fechamento", () => {
  const text = buildExecuteInstruction("landing oficina", { loopStep: 1 });
  assertEquals(text.includes("FASE 4"), true);
  assertEquals(text.includes("pergunta aberta"), true);
});

Deno.test("buildExecuteInstruction buildFixResume — continuação sem ack", () => {
  const text = buildExecuteInstruction("corrigir build", { loopStep: 1, buildFixResume: true });
  assertEquals(text.includes("NÃO reconfirme"), true);
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

Deno.test("extractOriginalUserRequest prefers meta.planSourceRunId over string heuristics", () => {
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
});

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

Deno.test("resolveAllocateSandbox: plan mode sem sandbox existente não aloca", () => {
  assertEquals(
    resolveAllocateSandbox({
      planMode: true,
      userContent: "Crie uma landing completa com hero e formulário",
      projectHasSandbox: false,
    }),
    false,
  );
});

Deno.test("resolveAllocateSandbox: plan mode reutiliza sandbox existente", () => {
  assertEquals(
    resolveAllocateSandbox({
      planMode: true,
      userContent: "Monte um plano",
      projectHasSandbox: true,
    }),
    true,
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

Deno.test("resolveAllocateSandbox: plano aprovado + conversa não aloca novo", () => {
  // P2 fix: hasApprovedPlanInHistory é sinalizador, não forçador.
  // "oi" é conversa (interaction-only), então com projectHasSandbox=false
  // retorna false (não aloca novo).
  assertEquals(
    resolveAllocateSandbox({
      userContent: "oi",
      projectHasSandbox: false,
      hasApprovedPlanInHistory: true,
    }),
    false,
  );
});

Deno.test("resolveAllocateSandbox: plano aprovado + conversa + já tem sandbox reusa", () => {
  // P2 fix: com plano aprovado E conversa E já tem sandbox,
  // retorna true (reusa o existente, não cria novo).
  assertEquals(
    resolveAllocateSandbox({
      userContent: "oi",
      projectHasSandbox: true,
      hasApprovedPlanInHistory: true,
    }),
    true,
  );
});

Deno.test("resolveAllocateSandbox: plano aprovado + implementação aloca", () => {
  // P2 fix: com plano aprovado E mensagem implementável longa,
  // aloca normalmente.
  assertEquals(
    resolveAllocateSandbox({
      userContent:
        "adicione 3 botões de cores diferentes na home, com hover effects suaves, transições de 200ms, e cada botão deve ter um ícone SVG específico conforme o tema da landing page",
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
