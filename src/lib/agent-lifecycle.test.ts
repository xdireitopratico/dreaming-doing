import { describe, expect, it } from "vitest";
import {
  canTransitionJobStatus,
  canTransitionRunStatus,
  isAgentRuntimeV2ShadowEnabled,
} from "@forge/agent-contract/lifecycle";

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

describe("canTransitionJobStatus", () => {
  it("queued → leased → completed", () => {
    expect(canTransitionJobStatus("queued", "leased")).toBe(true);
    expect(canTransitionJobStatus("leased", "completed")).toBe(true);
  });

  it("leased → queued (re-queue após lease expirado)", () => {
    expect(canTransitionJobStatus("leased", "queued")).toBe(true);
  });
});

describe("isAgentRuntimeV2ShadowEnabled", () => {
  it("aceita shadow/1/true", () => {
    expect(isAgentRuntimeV2ShadowEnabled("shadow")).toBe(true);
    expect(isAgentRuntimeV2ShadowEnabled("1")).toBe(true);
    expect(isAgentRuntimeV2ShadowEnabled("true")).toBe(true);
    expect(isAgentRuntimeV2ShadowEnabled("")).toBe(false);
  });
});