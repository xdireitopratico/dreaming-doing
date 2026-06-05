import { describe, expect, it } from "vitest";
import { llmBackoffMs } from "@/lib/llm-retry";

describe("llm-retry", () => {
  it("respeita Retry-After em segundos", () => {
    expect(llmBackoffMs(0, 5)).toBe(5000);
    expect(llmBackoffMs(2, 120)).toBe(60_000);
  });

  it("backoff exponencial com teto", () => {
    expect(llmBackoffMs(0)).toBeGreaterThanOrEqual(1000);
    expect(llmBackoffMs(0)).toBeLessThan(1500);
    expect(llmBackoffMs(10)).toBeLessThanOrEqual(30_000);
  });
});