import { describe, it, expect } from "vitest";
import { DEFAULT_EXTRACTION_SCOPE, snapshotExtractionScope } from "@/lib/agent-deep-capture-contract";
import {
  mergeExtractionScope,
  parseScopeFromInstruction,
  summarizeScopeChanges,
} from "./scope-parser";

describe("snapshotExtractionScope", () => {
  it("defaults to level 7", () => {
    const scope = snapshotExtractionScope();
    expect(scope.level).toBe(7);
    expect(scope.intent).toBe("landing");
    expect(scope.folds).toBe("auto");
  });
});

describe("parseScopeFromInstruction", () => {
  it("expands to full site mapping", () => {
    const patch = parseScopeFromInstruction("Quero 100% do site mapeado");
    expect(patch?.intent).toBe("full_site");
    expect(patch?.pages).toBe("sitemap");
    expect(patch?.level).toBe(10);
  });

  it("narrows to hero only", () => {
    const patch = parseScopeFromInstruction("só hero por favor");
    expect(patch?.folds).toBe("hero_only");
    expect(patch?.categories).toEqual(["hero"]);
  });

  it("adds mobile viewport", () => {
    const patch = parseScopeFromInstruction("inclui mobile também");
    expect(patch?.viewports).toContain("mobile");
  });

  it("returns null for unrelated chat", () => {
    expect(parseScopeFromInstruction("como vai o progresso?")).toBeNull();
  });
});

describe("mergeExtractionScope", () => {
  it("merges patches onto default scope", () => {
    const base = snapshotExtractionScope();
    const patch = parseScopeFromInstruction("mapeia tudo");
    expect(patch).not.toBeNull();
    const merged = mergeExtractionScope(base, patch!);
    expect(merged.intent).toBe("full_site");
    expect(merged.level).toBe(10);
  });

  it("summarizes changes", () => {
    const before = DEFAULT_EXTRACTION_SCOPE;
    const after = mergeExtractionScope(before, { level: 10, intent: "full_site", pages: "sitemap" });
    const summary = summarizeScopeChanges(before, after);
    expect(summary.some((s) => s.includes("level"))).toBe(true);
    expect(summary.some((s) => s.includes("intent"))).toBe(true);
  });
});