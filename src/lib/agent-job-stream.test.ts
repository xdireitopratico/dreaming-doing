import { describe, expect, it } from "vitest";
import type { SSEEvent } from "@/lib/agent-progress";
import {
  buildJobStreamTree,
  chatPersistedNodes,
  deriveCardView,
  deriveInspectorView,
  miniVisibleNodes,
  normalizeThoughtProse,
} from "@/lib/agent-job-stream";

function ev(type: string, data: Record<string, unknown>, ts: number): SSEEvent {
  return { type, data, timestamp: ts };
}

describe("agent-job-stream tree", () => {
  it("read → edit → validate_fail produz steps e result", () => {
    const timeline: SSEEvent[] = [
      ev("phase", { phase: "gather", task_title: "Entender o projeto" }, 900),
      ev("tool_start", { name: "fs_read", args: { path: "src/App.tsx" } }, 1000),
      ev("tool_done", { name: "fs_read", ok: true }, 1100),
      ev("tool_start", { name: "fs_edit", args: { path: "src/Hero.tsx" } }, 1200),
      ev("tool_done", { name: "fs_edit", ok: true }, 1300),
      ev("validate_fail", { feedback: "Cannot find module Motion" }, 1400),
    ];

    const nodes = buildJobStreamTree(timeline, { running: false });
    expect(nodes.some((n) => n.kind === "task")).toBe(true);
    expect(nodes.filter((n) => n.kind === "step")).toHaveLength(2);
    expect(nodes.find((n) => n.kind === "step" && n.status === "done")).toBeTruthy();
    expect(nodes.find((n) => n.kind === "result" && n.status === "failed")).toBeTruthy();
  });

  it("phase/memory viram task nodes, não thought", () => {
    const timeline: SSEEvent[] = [
      ev("phase", { phase: "gather", message: "Lendo arquivos do projeto..." }, 1),
      ev("memory", { message: "Carregando memória…" }, 2),
      ev("classify", { message: "Classificando…" }, 3),
    ];
    const nodes = buildJobStreamTree(timeline, { running: false });
    expect(nodes.filter((n) => n.kind === "thought")).toHaveLength(0);
    expect(nodes.filter((n) => n.kind === "task").length).toBeGreaterThanOrEqual(3);
    const insp = deriveInspectorView(nodes);
    expect(insp.nodes.length).toBe(nodes.length);
  });

  it("assistant_text delta vira thought real do LLM", () => {
    const timeline: SSEEvent[] = [
      ev("assistant_text", { text: "Vou criar", delta: true, thinking: true }, 1),
      ev("assistant_text", { text: " a landing.", delta: true, thinking: true }, 2),
    ];
    const nodes = buildJobStreamTree(timeline, { running: true });
    expect(nodes.filter((n) => n.kind === "thought")).toHaveLength(1);
    expect(nodes[0]?.kind === "thought" && nodes[0].prose).toContain("Vou criar");
  });

  it("deltas token-a-token não quebram 1 palavra por linha", () => {
    const timeline: SSEEvent[] = [
      ev("assistant_text", { text: "Vou", delta: true, thinking: true }, 1),
      ev("assistant_text", { text: " criar", delta: true, thinking: true }, 2),
      ev("assistant_text", { text: " a landing", delta: true, thinking: true }, 3),
    ];
    const nodes = buildJobStreamTree(timeline, { running: false });
    const thought = nodes.find((n) => n.kind === "thought");
    expect(thought?.kind === "thought" && thought.prose).toBe("Vou criar a landing");
    expect(thought?.kind === "thought" && thought.prose.split("\n")).toHaveLength(1);
  });

  it("normalizeThoughtProse colapsa streaming legado", () => {
    expect(normalizeThoughtProse("Vou\ncriar\na")).toBe("Vou criar a");
  });

  it("narration não entra na árvore", () => {
    const timeline: SSEEvent[] = [
      ev("assistant_text", { text: "Primeiro passo…", narration: true }, 1),
      ev("tool_start", { name: "fs_read", args: { path: "package.json" } }, 2),
    ];
    const nodes = buildJobStreamTree(timeline, { running: true });
    expect(nodes.every((n) => n.kind !== "thought")).toBe(true);
    const step = nodes.find((n) => n.kind === "step");
    expect(step?.kind === "step" && step.expectation).toContain("configuração");
  });

  it("deriveCardView marca failed quando último nó é result failed", () => {
    const timeline: SSEEvent[] = [
      ev("tool_start", { name: "fs_edit", args: { path: "x.ts" } }, 1),
      ev("tool_done", { name: "fs_edit", ok: true }, 2),
      ev("validate_fail", { feedback: "err" }, 3),
    ];
    const nodes = buildJobStreamTree(timeline, { running: false });
    const view = deriveCardView(nodes, {
      finished: true,
      lastFinishOk: false,
      canceled: false,
      autoResuming: false,
      message: null,
      statusHint: null,
      phase: null,
    });
    expect(view.headerBadge).toBe("failed");
    expect(view.cardStatus).toBe("failed");
  });

  it("deriveCardView momentum reflete último passo ativo", () => {
    const timeline: SSEEvent[] = [
      ev("tool_start", { name: "fs_read", args: { path: "a.ts" } }, 1),
    ];
    const nodes = buildJobStreamTree(timeline, { running: true });
    const view = deriveCardView(
      nodes,
      {
        finished: false,
        lastFinishOk: null,
        canceled: false,
        autoResuming: false,
        message: null,
        statusHint: null,
        phase: null,
      },
      { running: true },
    );
    expect(view.headerBadge).toBe("working");
    expect(view.title).toMatch(/Consultar|configuração|entrada/i);
    expect(view.activeNode?.kind).toBe("step");
  });

  it("deriveInspectorView inclui thoughts, steps e errors", () => {
    const timeline: SSEEvent[] = [
      ev("assistant_text", { text: "Planning layout", delta: true, thinking: true }, 1),
      ev("tool_start", { name: "fs_read", args: { path: "x.ts" } }, 2),
      ev("validate_fail", { feedback: "boom" }, 3),
    ];
    const nodes = buildJobStreamTree(timeline, { running: false });
    const insp = deriveInspectorView(nodes);
    expect(insp.nodes.length).toBeGreaterThan(2);
    expect(insp.thoughts.length).toBeGreaterThan(0);
    expect(insp.errors.length).toBeGreaterThan(0);
  });

  it("chatPersistedNodes mantém árvore completa após finish", () => {
    const timeline: SSEEvent[] = [
      ev("phase", { phase: "gather", task_title: "Entender o projeto" }, 1),
      ev("tool_start", { name: "fs_read", args: { path: "src/App.tsx" } }, 2),
      ev("tool_done", { name: "fs_read", ok: true }, 3),
      ev("validate_ok", {}, 4),
    ];
    const nodes = buildJobStreamTree(timeline, { running: false });
    expect(nodes.length).toBeGreaterThan(2);
    expect(chatPersistedNodes(nodes)).toEqual(nodes);
    expect(miniVisibleNodes(nodes).length).toBeLessThan(nodes.length);
  });

  it("deriveCardView done nunca usa Concluído no título", () => {
    const timeline: SSEEvent[] = [
      ev("phase", { phase: "gather", task_title: "Entender o projeto" }, 1),
      ev("tool_start", { name: "fs_edit", args: { path: "src/Hero.tsx" } }, 2),
      ev("tool_done", { name: "fs_edit", ok: true }, 3),
    ];
    const nodes = buildJobStreamTree(timeline, { running: false });
    const view = deriveCardView(nodes, {
      finished: true,
      lastFinishOk: true,
      canceled: false,
      autoResuming: false,
      message: null,
      statusHint: null,
      phase: null,
    });
    expect(view.cardStatus).toBe("done");
    expect(view.title).not.toBe("Concluído");
    expect(view.title.length).toBeGreaterThan(0);
  });

  it("step_result cria result node com evidence", () => {
    const timeline: SSEEvent[] = [
      ev("step_result", { summary: "Build passou", evidence: ["typecheck OK"], ok: true }, 1),
    ];
    const nodes = buildJobStreamTree(timeline, { running: false });
    const result = nodes.find((n) => n.kind === "result");
    expect(result?.kind === "result" && result.summary).toBe("Build passou");
    expect(result?.kind === "result" && result.evidence).toContain("typecheck OK");
  });
});