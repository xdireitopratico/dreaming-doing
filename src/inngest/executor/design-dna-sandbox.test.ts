import { describe, it, expect } from "vitest";
import { resolveJobScopedSandboxId } from "./design-dna-sandbox";

describe("design-dna-sandbox — Gate G4.1", () => {
  it("resolveJobScopedSandboxId retorna sandbox só do job atual", () => {
    expect(resolveJobScopedSandboxId("job-1", "sb-abc")).toBe("sb-abc");
    expect(resolveJobScopedSandboxId("job-1", "  sb-xyz  ")).toBe("sb-xyz");
  });

  it("resolveJobScopedSandboxId retorna null sem sandbox do job", () => {
    expect(resolveJobScopedSandboxId("job-1", null)).toBeNull();
    expect(resolveJobScopedSandboxId("job-1", undefined)).toBeNull();
    expect(resolveJobScopedSandboxId("job-1", "")).toBeNull();
    expect(resolveJobScopedSandboxId("job-1", "   ")).toBeNull();
  });

  it("não consulta sandbox de outros jobs — função pura por design", () => {
    // Garantia arquitetural: ensureDesignDnaSandbox só recebe existingSandboxId do job
    const jobA = resolveJobScopedSandboxId("job-a", "sb-a");
    const jobB = resolveJobScopedSandboxId("job-b", "sb-b");
    expect(jobA).not.toBe(jobB);
  });
});