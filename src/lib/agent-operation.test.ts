import { describe, expect, it } from "vitest";
import {
  COOPERATIVE_WALL_MS,
  HOTL_WALL_MS,
  operationWallExceeded,
  parseOperationPreferences,
  parseRunOperationMeta,
  remainingOperationMs,
  shouldPauseForReason,
  snapshotOperation,
  formatOperationReportText,
  withHotlReport,
} from "@/lib/agent-operation-contract";

describe("operation contract", () => {
  it("default cooperative", () => {
    expect(parseOperationPreferences(undefined)).toEqual({ mode: "cooperative" });
  });

  it("cooperative wall 60min", () => {
    const snap = snapshotOperation({ mode: "cooperative" }, "2026-07-02T12:00:00.000Z");
    expect(snap.wallMs).toBe(COOPERATIVE_WALL_MS);
    expect(snap.reportOnExit).toBe(false);
  });

  it("hotl 48h com report", () => {
    const snap = snapshotOperation({ mode: "hotl", hotlWallHours: 48 });
    expect(snap.wallMs).toBe(HOTL_WALL_MS[48]);
    expect(snap.reportOnExit).toBe(true);
  });

  it("wall exceeded após 60min", () => {
    const snap = snapshotOperation({ mode: "cooperative" }, "2026-07-02T12:00:00.000Z");
    expect(operationWallExceeded(snap, Date.parse("2026-07-02T13:00:00.000Z"))).toBe(true);
    expect(operationWallExceeded(snap, Date.parse("2026-07-02T12:30:00.000Z"))).toBe(false);
  });

  it("remainingOperationMs", () => {
    const snap = snapshotOperation({ mode: "cooperative" }, "2026-07-02T12:00:00.000Z");
    expect(remainingOperationMs(snap, Date.parse("2026-07-02T12:30:00.000Z"))).toBe(30 * 60 * 1000);
  });

  it("shouldPauseForReason", () => {
    expect(shouldPauseForReason("cooperative", "llm_error")).toBe(true);
    expect(shouldPauseForReason("cooperative", "operation_wall")).toBe(true);
    expect(shouldPauseForReason("hotl", "llm_error")).toBe(false);
    expect(shouldPauseForReason("hotl", "operation_wall")).toBe(false);
  });

  it("formatOperationReportText — texto plano no chat", () => {
    const text = formatOperationReportText({
      kind: "exit",
      summary: "Landing pronta",
      steps: 8,
      touchedPaths: ["src/App.tsx"],
      wallMs: 24 * 60 * 60 * 1000,
    });
    expect(text).toContain("Relatório (Human on the Loop)");
    expect(text).toContain("Status: Concluído");
    expect(text).toContain("Passos: 8");
    expect(text).not.toContain("task");
  });

  it("withHotlReport — cooperative sem report", () => {
    const snap = snapshotOperation({ mode: "cooperative" });
    expect(withHotlReport("Feito.", snap, { kind: "exit", summary: "Feito." })).toBe("Feito.");
  });

  it("parseRunOperationMeta round-trip", () => {
    const snap = snapshotOperation({ mode: "hotl", hotlWallHours: 24 });
    expect(parseRunOperationMeta(snap)).toEqual(snap);
  });
});