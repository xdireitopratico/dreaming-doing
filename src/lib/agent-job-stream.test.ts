import { describe, expect, it } from "vitest";
import type { SSEEvent } from "@/lib/agent-progress";
import {
  buildJobStream,
  deriveCardView,
  deriveInspectorView,
} from "@/lib/agent-job-stream";

function ev(type: string, data: Record<string, unknown>, ts: number): SSEEvent {
  return { type, data, timestamp: ts };
}

describe("agent-job-stream", () => {
  it("read → edit → validate_fail produz átomos reais sem pipeline genérico", () => {
    const timeline: SSEEvent[] = [
      ev("tool_start", { name: "fs_read", args: { path: "src/App.tsx" } }, 1000),
      ev("tool_done", { name: "fs_read", ok: true }, 1100),
      ev("tool_start", { name: "fs_edit", args: { path: "src/Hero.tsx" } }, 1200),
      ev("tool_done", { name: "fs_edit", ok: true }, 1300),
      ev("validate_fail", { feedback: "Cannot find module Motion" }, 1400),
    ];

    const atoms = buildJobStream(timeline, { running: false });
    expect(atoms.some((a) => a.label.includes("Entender"))).toBe(false);
    expect(atoms.find((a) => a.kind === "read")?.status).toBe("done");
    expect(atoms.find((a) => a.kind === "edited")?.status).toBe("done");
    expect(atoms.find((a) => a.kind === "validate_fail")?.status).toBe("failed");
  });

  it("deriveCardView marca failed quando último átomo é validate_fail", () => {
    const timeline: SSEEvent[] = [
      ev("tool_start", { name: "fs_edit", args: { path: "x.ts" } }, 1),
      ev("tool_done", { name: "fs_edit", ok: true }, 2),
      ev("validate_fail", { feedback: "err" }, 3),
    ];
    const atoms = buildJobStream(timeline, { running: false });
    const view = deriveCardView(atoms, { finished: true, lastFinishOk: false, canceled: false, autoResuming: false });
    expect(view.headerBadge).toBe("failed");
    expect(view.cardStatus).toBe("failed");
  });

  it("deriveCardView working quando há átomo active", () => {
    const timeline: SSEEvent[] = [
      ev("tool_start", { name: "fs_read", args: { path: "a.ts" } }, 1),
    ];
    const atoms = buildJobStream(timeline, { running: true });
    const view = deriveCardView(atoms, { finished: false, lastFinishOk: null, canceled: false, autoResuming: false }, { running: true });
    expect(view.headerBadge).toBe("working");
    expect(view.tailSteps.length).toBeGreaterThan(0);
  });

  it("deriveInspectorView separa thoughts e erros", () => {
    const timeline: SSEEvent[] = [
      ev("assistant_text", { text: "Planning layout" }, 1),
      ev("validate_fail", { feedback: "boom" }, 2),
    ];
    const atoms = buildJobStream(timeline, { running: false });
    const insp = deriveInspectorView(atoms);
    expect(insp.thoughts.length).toBeGreaterThan(0);
    expect(insp.errors.length).toBeGreaterThan(0);
  });
});