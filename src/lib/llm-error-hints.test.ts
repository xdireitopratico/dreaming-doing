// llm-error-hints.test.ts — cobertura do mapeamento de erros
import { describe, expect, it } from "vitest";
import {
  llmErrorHint,
  e2bErrorHint,
  timeoutHint,
  zombieRunHint,
  inngestQueueHint,
} from "@/lib/llm-error-hints";

describe("llmErrorHint", () => {
  it("returns auth.invalid_key for 401", () => {
    const hint = llmErrorHint(new Error("401 Unauthorized: invalid api key"), false);
    expect(hint.code).toBe("auth.invalid_key");
    expect(hint.link).toBe("/api");
    expect(hint.severity).toBe("error");
  });

  it("returns auth.forbidden for 403", () => {
    const hint = llmErrorHint(new Error("403 forbidden - permission denied"), false);
    expect(hint.code).toBe("auth.forbidden");
    expect(hint.link).toBe("/models");
  });

  it("returns billing.no_credits for 402 or quota", () => {
    const hint = llmErrorHint(new Error("quota exceeded"), false);
    expect(hint.code).toBe("billing.no_credits");
  });

  it("returns model.not_found for 404 with nvidia", () => {
    const hint = llmErrorHint(new Error("404 model does not exist (nvidia/nemotron)"), false);
    expect(hint.code).toBe("model.not_found.nvidia");
  });

  it("returns model.not_found for 404 without nvidia", () => {
    const hint = llmErrorHint(new Error("404 model not found"), false);
    expect(hint.code).toBe("model.not_found");
  });

  it("returns model.overloaded for 529/503", () => {
    const a = llmErrorHint(new Error("529 overloaded"), false);
    const b = llmErrorHint(new Error("503 service unavailable"), false);
    expect(a.code).toBe("model.overloaded");
    expect(b.code).toBe("model.overloaded");
  });

  it("returns rate_limit.robin_rotating when robin active and 429", () => {
    const hint = llmErrorHint(new Error("429 rate limit"), true);
    expect(hint.code).toBe("rate_limit.robin_rotating");
  });

  it("returns rate_limit.single_key when not robin and 429", () => {
    const hint = llmErrorHint(new Error("429 rate limit"), false);
    expect(hint.code).toBe("rate_limit.single_key");
  });

  it("returns connection.unstable for network errors", () => {
    const hint = llmErrorHint(new Error("connection timed out"), false);
    expect(hint.code).toBe("connection.unstable");
  });

  it("falls back to llm.unknown for unclassified errors", () => {
    const hint = llmErrorHint(new Error("alguma coisa estranha"), false);
    expect(hint.code).toBe("llm.unknown");
  });

  it("truncates long messages to 300 chars", () => {
    const long = "x".repeat(500);
    const hint = llmErrorHint(new Error(long), false);
    expect(hint.message.length).toBeLessThanOrEqual(300);
  });
});

describe("e2bErrorHint", () => {
  it("returns e2b.not_configured for setup message", () => {
    const hint = e2bErrorHint("E2B_SETUP_USER_MESSAGE: configure em /api");
    expect(hint.code).toBe("e2b.not_configured");
    expect(hint.link).toBe("/onboarding");
  });

  it("returns e2b.invalid_key for 401/403", () => {
    const hint = e2bErrorHint(new Error("401 invalid api key"));
    expect(hint.code).toBe("e2b.invalid_key");
  });

  it("returns e2b.template_fallback for template not found", () => {
    const hint = e2bErrorHint(new Error("template not found: code-interpreter-v1"));
    expect(hint.code).toBe("e2b.template_fallback");
  });

  it("returns e2b.sandbox_dead for timeout/killed", () => {
    const hint = e2bErrorHint(new Error("sandbox killed (timeout)"));
    expect(hint.code).toBe("e2b.sandbox_dead");
  });
});

describe("timeoutHint", () => {
  it("returns edge.timeout with no link (in-place continue)", () => {
    const hint = timeoutHint();
    expect(hint.code).toBe("edge.timeout");
    expect(hint.link).toBeNull();
  });
});

describe("zombieRunHint", () => {
  it("returns agent.zombie_run", () => {
    expect(zombieRunHint().code).toBe("agent.zombie_run");
  });
});

describe("inngestQueueHint", () => {
  it("returns inngest.queue_failed", () => {
    expect(inngestQueueHint().code).toBe("inngest.queue_failed");
  });
});
