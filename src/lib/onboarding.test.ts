import { describe, it, expect, beforeEach } from "vitest";
import {
  ONBOARDING_STEPS,
  stepIndex,
  nextStep as nextStepFn,
  prevStep as prevStepFn,
  type OnboardingStepId,
  type OnboardingLocalState,
} from "@/lib/onboarding";

describe("onboarding state machine", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  it("ONBOARDING_STEPS includes welcome + 4 setup (done is terminal, not in array)", () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(ids).toEqual(["welcome", "api_keys", "model", "sandbox", "deploy"]);
  });

  it("stepIndex returns correct position for each step", () => {
    expect(stepIndex("welcome")).toBe(0);
    expect(stepIndex("api_keys")).toBe(1);
    expect(stepIndex("model")).toBe(2);
    expect(stepIndex("sandbox")).toBe(3);
    expect(stepIndex("deploy")).toBe(4);
    // "done" is terminal, not in array
    expect(stepIndex("done")).toBe(-1);
  });

  it("nextStep walks forward in the array (done is terminal)", () => {
    expect(nextStepFn("welcome")).toBe("api_keys");
    expect(nextStepFn("api_keys")).toBe("model");
    expect(nextStepFn("model")).toBe("sandbox");
    expect(nextStepFn("sandbox")).toBe("deploy");
    // After "deploy" the next is "done" (terminal)
    expect(nextStepFn("deploy")).toBe("done");
    // "done" is terminal — stays at "done"
    expect(nextStepFn("done")).toBe("done");
  });

  it("prevStep walks backward in the array", () => {
    expect(prevStepFn("welcome")).toBe("welcome"); // terminal
    expect(prevStepFn("api_keys")).toBe("welcome");
    expect(prevStepFn("model")).toBe("api_keys");
    expect(prevStepFn("sandbox")).toBe("model");
    expect(prevStepFn("deploy")).toBe("sandbox");
    // From terminal "done", goes back to "deploy"
    expect(prevStepFn("done")).toBe("deploy");
  });

  it("stepIndex returns -1 for unknown step ids (defensive)", () => {
    expect(stepIndex("nonexistent" as OnboardingStepId)).toBe(-1);
  });

  it("required steps are api_keys, model, sandbox", () => {
    const required = ONBOARDING_STEPS.filter((s) => s.required).map((s) => s.id);
    expect(required).toEqual(["api_keys", "model", "sandbox"]);
  });

  it("deploy is optional (skippable)", () => {
    const deploy = ONBOARDING_STEPS.find((s) => s.id === "deploy");
    expect(deploy?.required).toBe(false);
  });
});
