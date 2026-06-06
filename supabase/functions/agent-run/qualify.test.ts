import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildExecuteInstruction,
  extractOriginalUserRequest,
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