import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildExecuteInstruction,
  extractOriginalUserRequest,
  isPreviewActionRequest,
  looksLikeInteractionOnly,
  needsQualify,
} from "./qualify.ts";

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