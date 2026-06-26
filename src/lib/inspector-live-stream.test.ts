import { describe, expect, it } from "vitest";
import { buildForgeTimeline } from "@/lib/timeline-builder";
import type { SSEEvent } from "@/lib/agent-progress";

/** Regressão: inspector não congela após web_search — tool_done fecha a entrada. */
describe("inspector live stream", () => {
  it("timeline cresce e tool_done fecha web_search", () => {
    const events: SSEEvent[] = [
      { type: "thinking_text", data: { text: "Vou pesquisar." }, timestamp: 1 },
      { type: "tool_start", data: { name: "web_search", args: { query: "vite 7" } }, timestamp: 2 },
      { type: "tool_done", data: { name: "web_search", ok: true }, timestamp: 3 },
      { type: "assistant_text", data: { text: "Encontrei 2 pontos." }, timestamp: 4 },
    ];

    const mid = buildForgeTimeline(events.slice(0, 2), true);
    const done = buildForgeTimeline(events, false);

    expect(mid.length).toBeGreaterThan(0);

    const toolMid = mid.find((e) => e.type === "READ");
    const toolDone = done.find((e) => e.type === "READ");
    expect(toolMid?.active).toBe(true);
    expect(toolDone?.active).toBe(false);
    if (toolDone?.type === "READ") {
      expect(toolDone.ok).toBe(true);
    }
  });
});
