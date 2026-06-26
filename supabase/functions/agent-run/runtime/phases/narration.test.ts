import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { NarrationPhase } from "./narration.ts";

type Captured = { type: string; data: Record<string, unknown> };

function captureNarration(config?: { approvedPlanBuild?: boolean; buildFixResume?: boolean }) {
  const events: Captured[] = [];
  const phase = new NarrationPhase(
    {
      approvedPlanBuild: config?.approvedPlanBuild ?? false,
      buildFixResume: config?.buildFixResume ?? false,
    },
    (type, data) => events.push({ type, data: data as Record<string, unknown> }),
  );
  return { phase, events };
}

Deno.test("ensureOpeningBeforeWork — emite fallback quando ainda sem abertura", () => {
  const { phase, events } = captureNarration();
  phase.ensureOpeningBeforeWork("Vou explorar o projeto.");
  phase.ensureOpeningBeforeWork("Segunda tentativa.");
  assertEquals(events.length, 1);
  assertEquals(events[0].data.opening, true);
});

Deno.test("emitOpening — assistant_text com opening:true uma vez", () => {
  const { phase, events } = captureNarration();
  phase.emitOpening("Vou começar pelo layout.");
  phase.emitOpening("Segunda tentativa.");
  assertEquals(events.length, 1);
  assertEquals(events[0].type, "assistant_text");
  assertEquals(events[0].data.opening, true);
  assertEquals(phase.openingEmitted, true);
  assertEquals(phase.trim(), "Vou começar pelo layout.");
});

Deno.test("stream — narration no chat por padrão", () => {
  const { phase, events } = captureNarration();
  phase.stream("Trabalhando nos componentes.");
  assertEquals(events.length, 1);
  assertEquals(events[0].data.narration, true);
  assertEquals(events[0].data.text, "Trabalhando nos componentes.");
});

Deno.test("stream — approvedPlanBuild vai para inspector", () => {
  const { phase, events } = captureNarration({ approvedPlanBuild: true });
  phase.stream("Só inspector.");
  assertEquals(events.length, 1);
  assertEquals(events[0].type, "agent_note");
  assertEquals(events[0].data.text, "Só inspector.");
});

Deno.test("emitAgentProse — primeira frase vira abertura", () => {
  const { phase, events } = captureNarration();
  phase.emitAgentProse("Vou ajustar o header.", 0);
  assertEquals(events[0].data.opening, true);
  phase.emitAgentProse("Agora o footer.", 1);
  assertEquals(events.length, 2);
  assertEquals(events[1].data.narration, true);
});