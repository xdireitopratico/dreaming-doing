import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildHotlTerminalText,
  reportKindForPauseReason,
  shouldCooperativePause,
} from "./operation-pause-gate.ts";

const cooperative = {
  mode: "cooperative" as const,
  startedAt: "2026-01-01T00:00:00.000Z",
  wallMs: 3_600_000,
  reportOnExit: false,
};

const hotl = {
  mode: "hotl" as const,
  startedAt: "2026-01-01T00:00:00.000Z",
  wallMs: 86_400_000,
  reportOnExit: true,
};

Deno.test("shouldCooperativePause — cooperative pauses on fusibles", () => {
  assertEquals(shouldCooperativePause(cooperative, "llm_error"), true);
  assertEquals(shouldCooperativePause(cooperative, "step_limit"), true);
  assertEquals(shouldCooperativePause(cooperative, "operation_wall"), true);
});

Deno.test("shouldCooperativePause — HOTL terminal on fusibles", () => {
  assertEquals(shouldCooperativePause(hotl, "llm_error"), false);
  assertEquals(shouldCooperativePause(hotl, "step_limit"), false);
  assertEquals(shouldCooperativePause(hotl, "operation_wall"), false);
});

Deno.test("reportKindForPauseReason maps wall to timeout", () => {
  assertEquals(reportKindForPauseReason("operation_wall"), "timeout");
  assertEquals(reportKindForPauseReason("llm_error"), "error");
  assertEquals(reportKindForPauseReason("step_limit"), "error");
});

Deno.test("buildHotlTerminalText appends report when reportOnExit", () => {
  const text = buildHotlTerminalText("feito", hotl, { kind: "exit", steps: 2 });
  assertEquals(text.includes("feito"), true);
  assertEquals(text.includes("Relatório (Human on the Loop)"), true);
});

Deno.test("buildHotlTerminalText skips report for cooperative", () => {
  const text = buildHotlTerminalText("feito", cooperative, { kind: "exit", steps: 2 });
  assertEquals(text, "feito");
});