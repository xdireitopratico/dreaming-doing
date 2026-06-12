import { describe, expect, it } from "vitest";
import {
  formatAgentBusyMessage,
  isEditorAgentBusy,
  parseAgentBusyResponse,
} from "@/lib/agent-busy";
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

describe("parseAgentBusyResponse", () => {
  it("extrai activeRunId e reason zombie (S8)", () => {
    const info = parseAgentBusyResponse({
      busy: true,
      activeRunId: "88764445-0979-4442-91b5-432a239869f6",
      reason: "zombie",
      pendingCount: 0,
      message: "Agente travado",
    });
    expect(info?.activeRunId).toBe("88764445-0979-4442-91b5-432a239869f6");
    expect(info?.reason).toBe("zombie");
  });

  it("default reason running quando ausente", () => {
    expect(parseAgentBusyResponse({ busy: true, activeRunId: "abc" })?.reason).toBe("running");
  });
});

describe("formatAgentBusyMessage", () => {
  it("inclui prefixo do runId", () => {
    const msg = formatAgentBusyMessage({
      activeRunId: "88764445-0979-4442-91b5-432a239869f6",
      reason: "zombie",
    });
    expect(msg).toContain("88764445");
    expect(msg).toContain("travado");
  });
});