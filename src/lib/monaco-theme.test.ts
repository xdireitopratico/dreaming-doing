import { describe, expect, it } from "vitest";
import { FORGE_THEME } from "@/lib/monaco-theme";

describe("FORGE_THEME", () => {
  it("token rules usam apenas hex — Monaco rejeita rgba em foreground", () => {
    for (const rule of FORGE_THEME.rules) {
      if (!rule.foreground) continue;
      expect(rule.foreground).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
