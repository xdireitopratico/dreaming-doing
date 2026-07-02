import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import type { ForgeTimelineItem } from "@/lib/timeline-builder";
import { projectActionLedgerLine } from "./action-ledger";

describe("projectActionLedgerLine", () => {
  it("tool_start fs_read → Lendo path", () => {
    const line = projectActionLedgerLine({
      progress: {
        ...initialAgentProgress,
        finished: false,
        tools: [{ name: "fs_read", args: { path: "src/App.tsx" } }],
      },
      jobActive: true,
    });
    expect(line).toBe("Lendo App.tsx…");
  });

  it("tool_start fs_write → Editando path", () => {
    const line = projectActionLedgerLine({
      progress: {
        ...initialAgentProgress,
        finished: false,
        tools: [{ name: "fs_write", args: { path: "src/components/Header.tsx" } }],
      },
      jobActive: true,
    });
    expect(line).toBe("Editando Header.tsx…");
  });

  it("tool_start shell_exec → Executando command", () => {
    const line = projectActionLedgerLine({
      progress: {
        ...initialAgentProgress,
        finished: false,
        tools: [{ name: "shell_exec", args: { command: "npm run build" } }],
      },
      jobActive: true,
    });
    expect(line).toBe("Executando npm run build…");
  });

  it("phase compact → Compactando contexto", () => {
    const line = projectActionLedgerLine({
      progress: {
        ...initialAgentProgress,
        finished: false,
        phase: "compact",
        timeline: [
          {
            type: "phase",
            data: { phase: "compact", message: "Compactando contexto…" },
            timestamp: Date.now(),
          },
        ],
      },
      jobActive: true,
    });
    expect(line).toBe("Compactando contexto…");
  });

  it("finished + diffs → contagem de arquivos", () => {
    const line = projectActionLedgerLine({
      progress: {
        ...initialAgentProgress,
        finished: true,
        lastFinishOk: true,
        diffs: [
          { path: "a.ts", before: "", after: "x", op: "write" as const },
          { path: "b.ts", before: "", after: "y", op: "edit" as const },
          { path: "c.ts", before: "", after: "z", op: "edit" as const },
        ],
      },
      jobActive: false,
    });
    expect(line).toBe("☑ 3 arquivos alterados");
  });

  it("timeline ativa READ prioriza sobre task", () => {
    const timeline: ForgeTimelineItem[] = [
      { type: "READ", id: "r1", path: "lib/utils.ts", active: true },
    ];
    const line = projectActionLedgerLine({
      progress: {
        ...initialAgentProgress,
        finished: false,
        tasks: [{ id: "t1", label: "Configurar rotas", status: "active" }],
      },
      forgeTimeline: timeline,
      jobActive: true,
    });
    expect(line).toBe("Lendo utils.ts…");
  });

  it("sem sinal factual retorna null", () => {
    const line = projectActionLedgerLine({
      progress: { ...initialAgentProgress, finished: false },
      jobActive: true,
    });
    expect(line).toBeNull();
  });
});