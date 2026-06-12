import { describe, expect, it } from "vitest";
import { isEditorAgentBusy } from "@/lib/agent-busy";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";

describe("isEditorAgentBusy", () => {
  const idle = {
    running: false,
    activeRunId: null,
    finished: true,
    canceled: false,
    awaiting: false,
    connectInFlight: false,
  };

  it("não bloqueia turno otimista pendente", () => {
    expect(
      isEditorAgentBusy({
        ...idle,
        activeRunId: PENDING_RUN_ID,
        finished: false,
      }),
    ).toBe(false);
  });

  it("não bloqueia quando running=true mas activeRunId é __pending__", () => {
    expect(
      isEditorAgentBusy({
        ...idle,
        running: true,
        activeRunId: PENDING_RUN_ID,
        finished: false,
      }),
    ).toBe(false);
  });

  it("bloqueia run real em andamento", () => {
    expect(
      isEditorAgentBusy({
        ...idle,
        activeRunId: "run-123",
        finished: false,
      }),
    ).toBe(true);
  });

  it("bloqueia quando connect está em voo", () => {
    expect(
      isEditorAgentBusy({
        ...idle,
        connectInFlight: true,
      }),
    ).toBe(true);
  });
});