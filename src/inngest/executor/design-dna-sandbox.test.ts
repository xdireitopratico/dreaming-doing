import { describe, it, expect } from "vitest";
import { e2bSandboxTimeoutSeconds } from "./design-dna-sandbox";
import { COOPERATIVE_WALL_MS, HOTL_WALL_MS } from "@/lib/agent-operation-contract";

describe("e2bSandboxTimeoutSeconds", () => {
  it("cooperative 60min → 3600s", () => {
    expect(e2bSandboxTimeoutSeconds(COOPERATIVE_WALL_MS)).toBe(3600);
  });

  it("HOTL 72h caps at 7200s (E2B limit)", () => {
    expect(e2bSandboxTimeoutSeconds(HOTL_WALL_MS[72])).toBe(7200);
  });
});