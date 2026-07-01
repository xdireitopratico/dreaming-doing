import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { notifyLoopStatusFromHost } from "./loop-notify.ts";
import { NarrationPhase } from "./phases/narration.ts";

Deno.test("notifyLoopStatusFromHost — emite inspector quando há texto", () => {
  const notes: string[] = [];
  const narration = new NarrationPhase(
    { approvedPlanBuild: false, buildFixResume: false },
    () => {},
    () => {},
  );
  const orig = narration.emitInspectorNote.bind(narration);
  narration.emitInspectorNote = (text: string) => {
    notes.push(text);
    orig(text);
  };

  notifyLoopStatusFromHost(
    narration,
    {
      kind: "tool_batch",
      tools: [{ name: "fs_write", arguments: { path: "src/App.tsx" } }],
      allOk: true,
    },
    "crie landing page",
    new Set(["src/App.tsx"]),
  );
  assertEquals(notes.length, 0);
});