/**
 * E2E simulado — Gap 1 (Thinking vaza pro chat).
 *
 * Simula um stream SSE completo: o servidor emite `assistant_text
 * { thinking: true }` (legado) + `thinking_text` (novo). O chat
 * thread NÃO pode conter o raciocínio.
 *
 * Este teste é a rede de segurança: mesmo se o servidor voltar a
 * emitir só `assistant_text { thinking: true }` (e parar de emitir
 * `thinking_text`), o chat continua protegido pela defesa em
 * `turn-display.ts`.
 */

import { describe, it, expect } from "vitest";
import { applyAgentProgressEvent, initialAgentProgress, type AgentProgress, type SSEEvent } from "@/lib/agent-progress";
import { resolveTurnThinking } from "@/lib/chat/turn-display";
import { buildForgeTimeline } from "@/lib/forge-run";

function ev(type: string, data: Record<string, unknown>, ts: number): SSEEvent {
  return { type, data, timestamp: ts };
}

describe("Gap 1 — thinking stream isolado do chat", () => {
  it("stream completo: chat nunca vê raciocínio do LLM", () => {
    let progress: AgentProgress = { ...initialAgentProgress };

    progress = applyAgentProgressEvent(progress, ev("start", {}, 0));
    progress = applyAgentProgressEvent(progress, ev("phase", { phase: "plan", message: "Explorando…" }, 100));

    for (let i = 0; i < 5; i++) {
      progress = applyAgentProgressEvent(
        progress,
        ev("thinking_text", { text: `thought chunk ${i} `, append: true, delta: true }, 200 + i * 50),
      );
    }

    progress = applyAgentProgressEvent(
      progress,
      ev("assistant_text", { text: "Vou verificar o estado do container.", opening: true }, 600),
    );

    progress = applyAgentProgressEvent(
      progress,
      ev("assistant_text", { text: "Lendo o Dockerfile.lara agora.", narration: true, append: true, delta: true }, 700),
    );

    progress = applyAgentProgressEvent(progress, ev("tool_start", { name: "fs_read", args: { path: "Dockerfile.lara" } }, 800));
    progress = applyAgentProgressEvent(progress, ev("tool_done", { name: "fs_read", ok: true }, 900));

    expect(progress.streamText ?? "").not.toMatch(/thought chunk/);
    expect(progress.narrationText ?? "").not.toMatch(/thought chunk/);
    expect(progress.privateThoughtText ?? "").toContain("thought chunk");
  });

  it("legado sem thinking_text novo: chat ainda fica protegido", () => {
    let progress: AgentProgress = { ...initialAgentProgress };

    progress = applyAgentProgressEvent(progress, ev("start", {}, 0));

    for (let i = 0; i < 5; i++) {
      progress = applyAgentProgressEvent(
        progress,
        ev("assistant_text", { text: `reasoning chunk ${i} `, thinking: true, append: true, delta: true }, 100 + i * 50),
      );
    }

    expect(progress.streamText ?? "").not.toMatch(/reasoning chunk/);
    expect(progress.narrationText ?? "").not.toMatch(/reasoning chunk/);
  });

  it("thinking: true legado não dispara 'Thought for Xs' como 1º token", () => {
    let progress: AgentProgress = { ...initialAgentProgress };

    for (let i = 0; i < 5; i++) {
      progress = applyAgentProgressEvent(
        progress,
        ev("assistant_text", { text: `reasoning ${i} `, thinking: true, append: true, delta: true }, 100 + i * 50),
      );
    }

    const thinking = resolveTurnThinking(progress, null, null, true);
    expect(thinking?.active).toBe(true);
  });

  it("Inspector recebe o pensamento via buildForgeTimeline (legado)", () => {
    const timeline: SSEEvent[] = [
      ev("assistant_text", { text: "I need to investigate the container state. ", thinking: true, append: true, delta: true }, 100),
      ev("assistant_text", { text: "Maybe also check the build path.", thinking: true, append: true, delta: true }, 200),
    ];
    const items = buildForgeTimeline(timeline, true);
    const thought = items.find((i) => i.type === "THOUGHT");
    expect(thought).toBeDefined();
    if (thought?.type === "THOUGHT") {
      expect(thought.text).toContain("container state");
      expect(thought.text).toContain("build path");
    }
  });

  it("Inspector recebe o pensamento via buildForgeTimeline (novo thinking_text)", () => {
    const timeline: SSEEvent[] = [
      ev("thinking_text", { text: "Vou verificar o container. ", append: true, delta: true }, 100),
      ev("thinking_text", { text: "Talvez precise rebuildar.", append: true, delta: true }, 200),
    ];
    const items = buildForgeTimeline(timeline, true);
    const thought = items.find((i) => i.type === "THOUGHT");
    expect(thought).toBeDefined();
    if (thought?.type === "THOUGHT") {
      expect(thought.text).toContain("container");
      expect(thought.text).toContain("rebuildar");
    }
  });
});
