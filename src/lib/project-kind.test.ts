import { describe, it, expect } from "vitest";
import { resolveProjectKind, isAppProject, isAgentProject } from "@/lib/project-kind";

describe("project-kind", () => {
  describe("resolveProjectKind", () => {
    it("returns 'agent' when kind is 'agent'", () => {
      expect(resolveProjectKind({ kind: "agent", meta: null })).toBe("agent");
    });

    it("returns 'app' when kind is 'app'", () => {
      expect(resolveProjectKind({ kind: "app", meta: null })).toBe("app");
    });

    it("falls back to meta.kind when kind is null", () => {
      expect(resolveProjectKind({ kind: null, meta: { kind: "agent" } })).toBe("agent");
    });

    it("falls back to meta.kind when kind is undefined", () => {
      expect(resolveProjectKind({ kind: undefined, meta: { kind: "app" } })).toBe("app");
    });

    it("returns 'app' as default when kind and meta.kind are absent", () => {
      expect(resolveProjectKind({ kind: null, meta: null })).toBe("app");
    });

    it("returns 'app' when meta is empty object", () => {
      expect(resolveProjectKind({ kind: null, meta: {} })).toBe("app");
    });

    it("returns 'app' when meta.kind is an invalid value", () => {
      expect(resolveProjectKind({ kind: null, meta: { kind: "unknown" } })).toBe("app");
    });

    it("prefers kind over meta.kind when both are set", () => {
      expect(resolveProjectKind({ kind: "agent", meta: { kind: "app" } })).toBe("agent");
    });
  });

  describe("isAppProject", () => {
    it("returns true for app projects", () => {
      expect(isAppProject({ kind: "app", meta: null })).toBe(true);
    });

    it("returns true for default (no kind)", () => {
      expect(isAppProject({ kind: null, meta: null })).toBe(true);
    });

    it("returns false for agent projects", () => {
      expect(isAppProject({ kind: "agent", meta: null })).toBe(false);
    });
  });

  describe("isAgentProject", () => {
    it("returns true for agent projects", () => {
      expect(isAgentProject({ kind: "agent", meta: null })).toBe(true);
    });

    it("returns true when meta.kind is agent", () => {
      expect(isAgentProject({ kind: null, meta: { kind: "agent" } })).toBe(true);
    });

    it("returns false for app projects", () => {
      expect(isAgentProject({ kind: "app", meta: null })).toBe(false);
    });

    it("returns false for default (no kind)", () => {
      expect(isAgentProject({ kind: null, meta: null })).toBe(false);
    });
  });
});
