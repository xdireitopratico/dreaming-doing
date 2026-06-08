import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildExecuteInstruction,
  buildMobileStackQualifyMessage,
  extractOriginalUserRequest,
  isAmbiguousMobileRequest,
  isPreviewActionRequest,
  isProjectInventoryQuestion,
  isProjectSeedPlaceholder,
  isSeedPlaceholderAppContent,
  projectEntryPathFromFiles,
  looksLikeInteractionOnly,
  needsQualify,
} from "./qualify.ts";

Deno.test("extractOriginalUserRequest ignora mensagem de plano aprovado", () => {
  const req = extractOriginalUserRequest([
    { role: "user", content: "Crie uma landing de café" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "Plano aprovado — executar em modo Build." },
    { role: "user", content: "[Plano aprovado] Plano aprovado — executar em modo Build:\n• Hero" },
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

Deno.test("preview action não é conversa vaga nem qualify", () => {
  assertEquals(isPreviewActionRequest("envia para o preview"), true);
  assertEquals(looksLikeInteractionOnly("envia para o preview"), false);
  assertEquals(
    needsQualify("envia para o preview", {
      complexity: 2,
      type: "other",
      summary: "x",
      needsBuild: false,
      needsDeps: false,
    }),
    false,
  );
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
    assertEquals(
      needsQualify(s, {
        complexity: 1,
        type: "other",
        summary: "x",
        needsBuild: false,
        needsDeps: false,
      }),
      false,
    );
  }
});

Deno.test("pergunta de inventário não entra em needsQualify", () => {
  assertEquals(isProjectInventoryQuestion("o que temos pronto no projeto?"), true);
  assertEquals(
    needsQualify("o que temos pronto no projeto?", {
      complexity: 1,
      type: "other",
      summary: "x",
      needsBuild: false,
      needsDeps: false,
    }),
    false,
  );
});

Deno.test("needsBuild pula qualify", () => {
  assertEquals(
    needsQualify("site", {
      complexity: 2,
      type: "other",
      summary: "x",
      needsBuild: true,
      needsDeps: false,
    }),
    false,
  );
});

Deno.test("seed placeholder + new_project pula qualify", () => {
  assertEquals(
    needsQualify("landing de café", {
      complexity: 3,
      type: "new_project",
      summary: "x",
      needsBuild: false,
      needsDeps: false,
    }, { isSeedPlaceholder: true }),
    false,
  );
});

Deno.test("projectEntryPathFromFiles expo vs web", () => {
  assertEquals(
    projectEntryPathFromFiles([{ path: "app.json", content: "{}" }]),
    "app/index.tsx",
  );
  assertEquals(
    projectEntryPathFromFiles([{ path: "src/App.tsx", content: "x" }]),
    "src/App.tsx",
  );
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
  assertEquals(isSeedPlaceholderAppContent('export default () => <p>Canvas vazio</p>'), true);
  assertEquals(isSeedPlaceholderAppContent("export default function App() { return <Hero/> }"), false);
});

Deno.test("needsQualify para pedido curto", () => {
  assertEquals(
    needsQualify("site", { complexity: 2, type: "other", summary: "x", needsBuild: false, needsDeps: false }),
    true,
  );
  assertEquals(
    needsQualify("Crie landing completa para cafeteria artesanal em SP com menu e reservas", {
      complexity: 4,
      type: "new_project",
      summary: "x",
      needsBuild: true,
      needsDeps: false,
    }),
    false,
  );
});

Deno.test("isAmbiguousMobileRequest para app de voz sem stack", () => {
  assertEquals(isAmbiguousMobileRequest("app de voz para celular"), true);
  assertEquals(isAmbiguousMobileRequest("app expo de voz"), false);
  assertEquals(isAmbiguousMobileRequest("app android kotlin"), false);
});

Deno.test("buildMobileStackQualifyMessage oferece Expo e Kotlin", () => {
  const msg = buildMobileStackQualifyMessage();
  assertEquals(msg.includes("Expo"), true);
  assertEquals(msg.includes("Kotlin"), true);
});