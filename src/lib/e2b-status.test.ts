import { describe, expect, it } from "vitest";
import { formatE2bUserError, isE2bConfigured, isE2bNotConfiguredError } from "@/lib/e2b-status";

describe("e2b-status", () => {
  it("detects configured connector row", () => {
    expect(isE2bConfigured([{ kind: "github" }, { kind: "e2b" }])).toBe(true);
    expect(isE2bConfigured([{ kind: "openai" }])).toBe(false);
  });

  it("flags only true missing-key errors", () => {
    expect(isE2bNotConfiguredError("Sandbox E2B não configurado", "e2b_not_configured")).toBe(true);
    expect(isE2bNotConfiguredError("E2B connect 401: invalid key")).toBe(false);
  });

  it("maps API failures separately from missing key", () => {
    expect(formatE2bUserError("E2B connect 401: bad")).toContain("recusada");
    expect(formatE2bUserError("Sandbox E2B não configurado", "e2b_not_configured")).toContain(
      "salve de novo",
    );
    expect(formatE2bUserError("E2B create 404: template 'nodejs' not found")).toContain("Template");
  });
});