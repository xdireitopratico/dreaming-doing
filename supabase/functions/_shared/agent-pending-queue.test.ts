import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { previewFromQueueBody } from "./agent-pending-queue.ts";

Deno.test("previewFromQueueBody — texto direto", () => {
  const preview = previewFromQueueBody({
    text: "Adicionar botão de logout no header",
    messageId: "m1",
  });
  assertEquals(preview, "Adicionar botão de logout no header");
});

Deno.test("previewFromQueueBody — parts", () => {
  const preview = previewFromQueueBody({
    parts: [{ type: "text", text: "Refatorar App.tsx" }],
  });
  assertEquals(preview, "Refatorar App.tsx");
});

Deno.test("previewFromQueueBody — prefs only fallback", () => {
  const preview = previewFromQueueBody({ preferences: { mode: "auto" } });
  assertEquals(preview.includes("enfileirado"), true);
});