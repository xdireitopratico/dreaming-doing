import { describe, expect, it } from "vitest";
import { formatQueueBlockReason, TERMINAL_STATUSES } from "@/hooks/agent-run/agent-run-connect";

describe("formatQueueBlockReason", () => {
  it("traduz blocking_run", () => {
    expect(formatQueueBlockReason("blocking_run:abc")).toMatch(/Agente ainda em execução/);
  });

  it("traduz inngest_failed", () => {
    expect(formatQueueBlockReason("inngest_failed")).toMatch(/INNGEST_EVENT_KEY/);
  });

  it("retorna null sem reason", () => {
    expect(formatQueueBlockReason()).toBeNull();
  });

  it("passa reason desconhecido", () => {
    expect(formatQueueBlockReason("custom")).toBe("custom");
  });
});

describe("TERMINAL_STATUSES", () => {
  it("inclui status terminais conhecidos", () => {
    expect(TERMINAL_STATUSES.has("completed")).toBe(true);
    expect(TERMINAL_STATUSES.has("failed")).toBe(true);
    expect(TERMINAL_STATUSES.has("canceled")).toBe(true);
    expect(TERMINAL_STATUSES.has("awaiting_user")).toBe(true);
    expect(TERMINAL_STATUSES.has("running")).toBe(false);
  });
});