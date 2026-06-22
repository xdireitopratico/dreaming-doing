import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/lib/timeline-builder";

/** Regressão: inspector não congela após web_search — tool_done fecha a entrada. */
describe("inspector live stream", () => {
  it("timeline cresce e tool_done fecha web_search", () => {
    const events = [
      { type: "thinking_text" as const, data: { text: "Vou pesquisar." }, timestamp: 1 },
      { type: "tool_start" as const, data: { name: "web_search", args: { query: "vite 7" } }, timestamp: 2 },
      { type: "tool_done" as const, data: { name: "web_search", ok: true }, timestamp: 3 },
      { type: "assistant_text" as const, data: { text: "Encontrei 2 pontos." }, timestamp: 4 },
    ];

    const mid = buildTimeline(events.slice(0, 2), true);
    const done = buildTimeline(events, false);

    expect(mid.length).toBeGreaterThan(0);

    const toolMid = mid.find((e) => e.kind === "tool");
    const toolDone = done.find((e) => e.kind === "tool");
    expect(toolMid?.active).toBe(true);
    expect(toolDone?.active).toBe(false);
    expect(toolDone?.ok).toBe(true);
    expect(toolDone?.label).toMatch(/Pesquisando|web_search/i);
  });
});