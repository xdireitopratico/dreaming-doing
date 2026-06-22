import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCardSnapshot,
  diffsFromTimeline,
  latencyThoughtMsFromTimeline,
  toolsFromTimeline,
} from "./snapshot.ts";

Deno.test("toolsFromTimeline — pareia tool_start com tool_done", () => {
  const timeline = [
    { type: "tool_start", data: { name: "fs_write", args: { path: "a.ts" } }, timestamp: 1 },
    { type: "tool_done", data: { name: "fs_write", ok: true }, timestamp: 2 },
  ];
  const tools = toolsFromTimeline(timeline);
  assertEquals(tools.length, 1);
  assertEquals(tools[0].name, "fs_write");
  assertEquals(tools[0].ok, true);
});

Deno.test("diffsFromTimeline — file_diff vira entrada estruturada", () => {
  const timeline = [
    {
      type: "file_diff",
      data: { path: "src/a.ts", before: "a", after: "b", op: "edit" },
      timestamp: 100,
    },
  ];
  const diffs = diffsFromTimeline(timeline);
  assertEquals(diffs.length, 1);
  assertEquals(diffs[0].path, "src/a.ts");
  assertEquals(diffs[0].op, "edit");
});

Deno.test("latencyThoughtMsFromTimeline — primeiro assistant_text", () => {
  const runStart = 1000;
  const timeline = [
    { type: "phase", data: { phase: "gather" }, timestamp: 1100 },
    { type: "assistant_text", data: { text: "Vou começar." }, timestamp: 2500 },
  ];
  assertEquals(latencyThoughtMsFromTimeline(timeline, runStart), 1500);
});

Deno.test("buildCardSnapshot — monta snapshot terminal", () => {
  const runStart = 5000;
  const timeline = [
    { type: "assistant_text", data: { text: "Pronto." }, timestamp: 6000 },
  ];
  const snapshot = buildCardSnapshot({
    timeline,
    narrationBuffer: "Narração",
    runStartTime: runStart,
    runId: "run-1",
    projectId: "proj-1",
    currentStepIndex: 3,
    maxStepsLimit: 70,
    now: 7000,
    opts: {
      streamText: "Feito.",
      deliveryFiles: ["src/a.ts"],
      finished: true,
    },
  });
  assertEquals(snapshot.streamText, "Feito.");
  assertEquals(snapshot.finished, true);
  assertEquals(snapshot.narrationText, "Narração");
  assertEquals(snapshot.latencyThoughtMs, 1000);
  assertEquals(snapshot.currentStep, 3);
  assertEquals(snapshot.totalSteps, 70);
});