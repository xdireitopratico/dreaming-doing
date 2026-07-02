import { describe, expect, it } from "vitest";
import { canTransitionRunStatus, partitionRunExtras } from "@forge/agent-contract/lifecycle";

describe("partitionRunExtras", () => {
  it("separa colunas e meta", () => {
    const { columns, metaDelta } = partitionRunExtras({
      error: "x",
      meta: { chunkGeneration: 2 },
      planMode: true,
    });
    expect(columns.error).toBe("x");
    expect(metaDelta.chunkGeneration).toBe(2);
    expect(metaDelta.planMode).toBe(true);
  });
});

describe("canTransitionRunStatus", () => {
  it("pending → running", () => {
    expect(canTransitionRunStatus("pending", "running")).toBe(true);
  });

  it("pending → completed (fechar plan run sem dispatch)", () => {
    expect(canTransitionRunStatus("pending", "completed")).toBe(true);
  });

  it("running → awaiting_user", () => {
    expect(canTransitionRunStatus("running", "awaiting_user")).toBe(true);
  });

  it("não reverte awaiting_user → running (nova run no dispatch)", () => {
    expect(canTransitionRunStatus("awaiting_user", "running")).toBe(false);
  });

  it("não reverte completed → running", () => {
    expect(canTransitionRunStatus("completed", "running")).toBe(false);
  });

  it("failed → running (resume)", () => {
    expect(canTransitionRunStatus("failed", "running")).toBe(true);
  });

  it("completed → awaiting_user (repair histórico)", () => {
    expect(canTransitionRunStatus("completed", "awaiting_user")).toBe(true);
  });

  it("canceled permanece terminal", () => {
    expect(canTransitionRunStatus("canceled", "completed")).toBe(false);
  });
});