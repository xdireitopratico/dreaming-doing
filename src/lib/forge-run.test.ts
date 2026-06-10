import { describe, expect, it } from "vitest";
import { initialAgentProgress, type PendingPlan } from "@/lib/agent-progress";
import {
  buildAgentRunView,
  buildForgeTimeline,
  collectMiniCardBriefings,
  deriveBrainstormTitle,
  deriveSessionTitle,
  deriveTasksFromPlan,
  isRunEffectivelyActive,
  shouldShowJobCard,
} from "@/lib/forge-run";

const samplePlan: PendingPlan = {
  planId: "p1",
  summary: "Landing page",
  mission: "Criar landing",
  steps: [
    { id: "s1", type: "custom", description: "Hero section", enabled: true },
    { id: "s2", type: "custom", description: "Features section", enabled: true },
    { id: "s3", type: "custom", description: "CTA section", enabled: true },
  ],
  ttlMs: 60_000,
  proposedAt: Date.now(),
  runId: "run-1",
  projectId: "proj-1",
};

describe("forge-run job requirements", () => {
  it("lista atômica usa passos do plano, não fases da timeline", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute",
      currentStep: 1,
      timeline: [
        { type: "phase", data: { phase: "gather", message: "Coletando contexto" }, timestamp: 1 },
        { type: "memory", data: { message: "Lendo arquivos" }, timestamp: 2 },
      ],
    };

    const view = buildAgentRunView("run-1", progress, {
      running: true,
      jobPlan: samplePlan,
    });

    expect(view.miniCard.tasks.map((t) => t.label)).toEqual([
      "Hero section",
      "Features section",
      "CTA section",
    ]);
    expect(view.miniCard.tasks.some((t) => t.label.includes("Coletando"))).toBe(false);
  });

  it("sem plano não deriva tarefas da timeline SSE", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute",
      timeline: [
        { type: "phase", data: { phase: "execute", message: "Gerando código" }, timestamp: 1 },
        { type: "memory", data: { message: "Editando App.tsx" }, timestamp: 2 },
      ],
    };

    const view = buildAgentRunView("run-1", progress, { running: true });
    expect(view.miniCard.tasks).toEqual([]);
  });

  it("marca todos os passos como done quando o job terminou com sucesso", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "done",
      finished: true,
      lastFinishOk: true,
      currentStep: 2,
    };

    const tasks = deriveTasksFromPlan(samplePlan, progress);
    expect(tasks.every((t) => t.status === "done")).toBe(true);
  });
});

describe("shouldShowJobCard", () => {
  it("mantém mini card na fase classify enquanto a run está ativa", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "classify",
      finished: false,
    };

    expect(
      shouldShowJobCard({
        runId: "run-1",
        progress,
        isQualifyOnly: false,
        isAgentJobMessage: false,
        hasExecutionEvidence: false,
        slotActive: false,
        activeRunId: "run-1",
      }),
    ).toBe(true);
  });

  it("oculta mini card em turno qualify-only", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "classify",
      awaitingKind: "qualify" as const,
      finished: true,
    };

    expect(
      shouldShowJobCard({
        runId: "run-1",
        progress,
        isQualifyOnly: true,
        isAgentJobMessage: false,
        hasExecutionEvidence: false,
        slotActive: false,
        activeRunId: null,
      }),
    ).toBe(false);
  });
});

describe("forge-run terminal state", () => {
  it("não trata run como ativa quando progress.finished", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      timeline: [
        {
          type: "assistant_text",
          data: { delta: true, text: "Pensando…" },
          timestamp: Date.now() - 5000,
        },
      ],
    };

    expect(isRunEffectivelyActive(progress, true)).toBe(false);

    const view = buildAgentRunView("run-1", progress, {
      running: true,
      jobPlan: samplePlan,
    });

    expect(view.miniCard.status).toBe("done");
    expect(view.thinking?.active ?? false).toBe(false);
    const thought = buildForgeTimeline(progress.timeline, false).at(-1);
    expect(thought).toBeUndefined();
  });

  it("delta sem thinking não vira THOUGHT no inspector", () => {
    const items = buildForgeTimeline(
      [
        {
          type: "assistant_text",
          data: { delta: true, text: "O Expo roda melhor nesta plataforma…" },
          timestamp: 1,
        },
      ],
      true,
    );
    expect(items.some((i) => i.type === "THOUGHT")).toBe(false);
  });

  it("deriveSessionTitle não repete wrap-up do chat", () => {
    const wrapUp = "**Pronto!** Resumo do que fiz:\n\nNenhum arquivo foi alterado.";
    const title = deriveSessionTitle(
      {
        ...initialAgentProgress,
        finished: true,
        summary: wrapUp,
        streamText: wrapUp,
        planSummary: wrapUp,
      },
      { ...samplePlan, summary: wrapUp, mission: wrapUp },
      "app mobile com voz",
    );
    expect(title).not.toContain("Pronto");
    expect(title).not.toContain("Resumo do que fiz");
    expect(title).toMatch(/Brainstorm|app mobile|Sessão/i);
  });

  it("mini-card done mesmo com slotActive stale após finish", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      phase: "execute",
      currentStep: 3,
    };

    const view = buildAgentRunView("run-1", progress, {
      running: true,
      jobPlan: samplePlan,
    });

    expect(view.miniCard.status).toBe("done");
    expect(view.miniCard.tasks.every((t) => t.status === "done")).toBe(true);
  });
});

describe("forge-run mini card briefing e título", () => {
  it("briefings vêm da timeline, não do streamText do chat", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute",
      streamText: "Entendi que você quer um app mobile. Antes de codar, qual caminho prefere?",
      message: "Gerando código",
      timeline: [
        { type: "phase", data: { phase: "execute", message: "Implementando layout" }, timestamp: 1 },
        { type: "tool_start", data: { name: "fs_read", args: { path: "src/App.tsx" } }, timestamp: 2 },
      ],
    };
    const timeline = buildForgeTimeline(progress.timeline, true);
    const briefings = collectMiniCardBriefings(progress, timeline, [], true);

    expect(briefings.some((b) => b.includes("Lendo App.tsx"))).toBe(true);
    expect(briefings.some((b) => b.includes("Entendi que você quer"))).toBe(false);
  });

  it("título de sessão qualify vira brainstorm, não repete pergunta", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      awaitingKind: "qualify" as const,
      phase: "classify",
      streamText: "Entendi que você quer um app mobile. Antes de codar, qual caminho prefere?",
    };

    expect(deriveBrainstormTitle("quero um app mobile para padaria")).toBe(
      "Brainstorm de app mobile para padaria",
    );
    expect(deriveSessionTitle(progress, null, "quero um app mobile")).toBe(
      "Brainstorm de app mobile",
    );
  });

  it("run ativo expõe liveBriefings no mini card", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "gather",
      message: "Analisando estrutura",
      timeline: [
        { type: "memory", data: { message: "Lendo package.json" }, timestamp: 1 },
      ],
    };
    const view = buildAgentRunView("run-1", progress, { running: true });
    expect(view.miniCard.liveBriefings.length).toBeGreaterThan(0);
    expect(view.miniCard.liveBriefings.some((b) => /package\.json|Analisando/i.test(b))).toBe(
      true,
    );
  });
});