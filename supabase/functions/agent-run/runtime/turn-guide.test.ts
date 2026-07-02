import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateReadGate,
  evaluateTurnGuidePreTurn,
  shouldLoopBackForZeroDelivery,
  ZERO_DELIVERY_LOOP_BACK_MESSAGE,
  READ_GATE_RELAX_AFTER,
  READ_ONLY_STALL_THRESHOLD,
} from "./turn-guide.ts";
import type { ToolCall } from "../types.ts";

const UI_PATCH: ToolCall = {
  id: "1",
  name: "fs_edit",
  arguments: { path: "src/App.tsx" },
};

Deno.test("evaluateTurnGuidePreTurn — 3 batches só read emite nudge_stall", () => {
  const decision = evaluateTurnGuidePreTurn({
    consecutiveReadOnlyBatches: READ_ONLY_STALL_THRESHOLD,
    touchedPathsCount: 0,
  });
  assertEquals(decision.action, "nudge_stall");
  if (decision.action === "nudge_stall") {
    assertEquals(decision.message.length > 0, true);
  }
});

Deno.test("evaluateTurnGuidePreTurn — abaixo do threshold segue proceed", () => {
  const decision = evaluateTurnGuidePreTurn({
    consecutiveReadOnlyBatches: READ_ONLY_STALL_THRESHOLD - 1,
    touchedPathsCount: 0,
  });
  assertEquals(decision.action, "proceed");
});

Deno.test("evaluateTurnGuidePreTurn — com writes não nudgeia", () => {
  const decision = evaluateTurnGuidePreTurn({
    consecutiveReadOnlyBatches: READ_ONLY_STALL_THRESHOLD,
    touchedPathsCount: 2,
  });
  assertEquals(decision.action, "proceed");
});

Deno.test("evaluateReadGate — bloqueia patch UI sem read_paths lidos", () => {
  const decision = evaluateReadGate({
    readPaths: ["packages/forge-ui/src/compositions/opinionated/HeroCinematicSpotlight.tsx"],
    readsDone: new Set(),
    patchCalls: [UI_PATCH],
    readGateBlockCount: 0,
  });
  assertEquals(decision.action, "block_read_gate");
  if (decision.action === "block_read_gate") {
    assertEquals(decision.missing.length, 1);
    assertEquals(decision.message.includes("Bloqueado"), true);
  }
});

Deno.test("evaluateReadGate — relaxa após 2 blocks", () => {
  const decision = evaluateReadGate({
    readPaths: ["src/App.tsx"],
    readsDone: new Set(),
    patchCalls: [UI_PATCH],
    readGateBlockCount: READ_GATE_RELAX_AFTER - 1,
  });
  assertEquals(decision.action, "read_gate_relaxed");
  if (decision.action === "read_gate_relaxed") {
    assertEquals(decision.missing, ["src/App.tsx"]);
  }
});

Deno.test("evaluateReadGate — passa quando paths lidos", () => {
  const decision = evaluateReadGate({
    readPaths: ["src/App.tsx"],
    readsDone: new Set(["src/App.tsx"]),
    patchCalls: [UI_PATCH],
    readGateBlockCount: 0,
  });
  assertEquals(decision.action, "proceed");
});

Deno.test("shouldLoopBackForZeroDelivery — intent acionável sem arquivos", () => {
  assertEquals(
    shouldLoopBackForZeroDelivery({ actionableIntent: true, touchedPathsCount: 0 }),
    true,
  );
  assertEquals(
    shouldLoopBackForZeroDelivery({ actionableIntent: false, touchedPathsCount: 0 }),
    false,
  );
});

Deno.test("ZERO_DELIVERY_LOOP_BACK_MESSAGE — pede tool_calls nativas", () => {
  assertEquals(ZERO_DELIVERY_LOOP_BACK_MESSAGE.includes("tool_calls"), true);
  assertEquals(ZERO_DELIVERY_LOOP_BACK_MESSAGE.includes("Continuar"), false);
});