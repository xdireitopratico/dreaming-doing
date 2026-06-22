import { describe, expect, it } from "vitest";
import {
  canTransitionJobStatus,
  canTransitionRunStatus,
  isAgentJobsEnabled,
  isAgentRuntimeV2ShadowEnabled,
  isAgentRuntimeV2WorkerEnabled,
  parseAgentRuntimeV2Mode,
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

describe("AgentRuntimeV2 mode", () => {
  it("parseAgentRuntimeV2Mode", () => {
    expect(parseAgentRuntimeV2Mode("worker")).toBe("worker");
    expect(parseAgentRuntimeV2Mode("shadow")).toBe("shadow");
    expect(parseAgentRuntimeV2Mode("")).toBe("off");
  });

  it("isAgentJobsEnabled — shadow, worker e legacy", () => {
    expect(isAgentJobsEnabled("shadow")).toBe(true);
    expect(isAgentJobsEnabled("worker")).toBe(true);
    expect(isAgentJobsEnabled("1")).toBe(true);
    expect(isAgentJobsEnabled("")).toBe(false);
    expect(isAgentRuntimeV2ShadowEnabled("worker")).toBe(true);
  });

  it("isAgentRuntimeV2WorkerEnabled — só worker", () => {
    expect(isAgentRuntimeV2WorkerEnabled("worker")).toBe(true);
    expect(isAgentRuntimeV2WorkerEnabled("shadow")).toBe(false);
    expect(isAgentRuntimeV2WorkerEnabled("")).toBe(false);
  });
});