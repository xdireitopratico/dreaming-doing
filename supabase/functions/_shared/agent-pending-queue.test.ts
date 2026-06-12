import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BUSY_ZOMBIE_GAP_MS,
  classifyAgentBusyReason,
  previewFromQueueBody,
  resolveQueuedPlanMode,
} from "./agent-pending-queue.ts";

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

Deno.test("resolveQueuedPlanMode — pendingBody.plan vence inputPlanMode false (S7)", () => {
  assertEquals(
    resolveQueuedPlanMode({
      pendingBody: { mode: "plan", messageId: "m1" },
      inputPlanMode: false,
    }),
    true,
  );
});

Deno.test("resolveQueuedPlanMode — meta.mode plan quando body sem mode (d7de3a27)", () => {
  assertEquals(
    resolveQueuedPlanMode({
      pendingBody: { messageId: "m-plan" },
      messageMetaMode: "plan",
      inputPlanMode: false,
    }),
    true,
  );
  assertEquals(
    resolveQueuedPlanMode({
      pendingBody: { messageId: "m-plan" },
      messageMetaMode: "plan",
    }),
    true,
  );
});

Deno.test("resolveQueuedPlanMode — legacy sem mode cai em build", () => {
  assertEquals(
    resolveQueuedPlanMode({ pendingBody: { messageId: "m1" }, inputPlanMode: false }),
    false,
  );
});

Deno.test("classifyAgentBusyReason — gap longo em running vira zombie (88764445)", () => {
  assertEquals(
    classifyAgentBusyReason({
      status: "running",
      lastActivityAgeMs: BUSY_ZOMBIE_GAP_MS + 1,
    }),
    "zombie",
  );
  assertEquals(
    classifyAgentBusyReason({ status: "running", lastActivityAgeMs: 30_000 }),
    "running",
  );
  assertEquals(classifyAgentBusyReason({ otherConversation: true }), "other_conversation");
});
