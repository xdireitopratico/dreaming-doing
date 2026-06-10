import { describe, expect, it } from "vitest";
import { hashToolBatch, hashToolStep, isExecutionStuck } from "@/lib/agent-stuck";

describe("agent-stuck", () => {
  it("hashToolStep é estável com ordem de chaves", () => {
    const a = hashToolStep("fs_write", { path: "a.ts", content: "x" });
    const b = hashToolStep("fs_write", { content: "x", path: "a.ts" });
    expect(a).toBe(b);
  });

  it("hashToolBatch concatena múltiplas tools", () => {
    const h = hashToolBatch([
      { name: "fs_read", arguments: { path: "a" } },
      { name: "fs_write", arguments: { path: "b" } },
    ]);
    expect(h).toContain("fs_read#");
    expect(h).toContain("fs_write#");
  });

  it("isExecutionStuck detecta 4 passos iguais", () => {
    const step = hashToolStep("shell_exec", { command: "npm test" });
    expect(isExecutionStuck([step, step, step, step])).toBe(true);
    expect(isExecutionStuck([step, step, step, "other"])).toBe(false);
    expect(isExecutionStuck([step, step, step])).toBe(false);
  });
});