import { describe, expect, it } from "vitest";
import { initialAgentProgress, type PendingPlan } from "@/lib/agent-progress";
import {
  buildAgentRunView,
  buildForgeTimeline,
  collectMiniCardBriefings,
  normalizeMiniCardBriefing,
  deriveBrainstormTitle,
  deriveSessionTitle,
  deriveTasksFromPlan,
  isRunEffectivelyActive,
  resolveLatencyThinking,
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

  it("plan teaser mostra até 4 passos pendentes com header Plan ready", () => {
    const progress = {
      ...initialAgentProgress,
      awaitingKind: "plan_approval" as const,
      awaiting: true,
      pendingPlan: samplePlan,
    };

    const view = buildAgentRunView("run-1", progress, {
      running: true,
      jobPlan: samplePlan,
      forcePlanReady: true,
    });

    expect(view.miniCard.header).toBe("Plan ready");
    expect(view.miniCard.tasks).toHaveLength(3);
    expect(view.miniCard.tasks.every((t) => t.status === "pending")).toBe(true);
  });

  it("tarefa atômica avança com currentStep do plano (0-based)", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute",
      currentStep: 1,
      totalSteps: 3,
    };
    const tasks = deriveTasksFromPlan(samplePlan, progress);
    expect(tasks[0]?.status).toBe("done");
    expect(tasks[1]?.status).toBe("active");
    expect(tasks[2]?.status).toBe("pending");
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
  it("turno conversacional não mostra mini-card", () => {
    expect(
      shouldShowJobCard({
        runId: "run-1",
        progress: {
          ...initialAgentProgress,
          finished: true,
          conversational: true,
          streamText: "Bom dia! Como posso ajudar?",
        },
        isQualifyOnly: false,
        isAgentJobMessage: true,
        hasExecutionEvidence: false,
        slotActive: false,
        activeRunId: "run-1",
      }),
    ).toBe(false);
  });
  it("run ativa: mini-card no primeiro token (gather)", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "gather",
      finished: false,
      message: "Checking browser route wiring in lara-workspace",
      statusHint: "Diagnosing Lara container gaps and needs",
    };

    expect(
      shouldShowJobCard({
        runId: "run-1",
        progress,
        isQualifyOnly: false,
        isAgentJobMessage: false,
        hasExecutionEvidence: true,
        slotActive: true,
        activeRunId: "run-1",
      }),
    ).toBe(true);
  });

  it("oculta mini card em turno qualify-only", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "classify",
      awaitingKind: "qualify" as const,
      awaiting: true,
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

  it("img 5: Edited file mostra mini-card", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute",
      finished: false,
      tools: [{ name: "fs_edit", args: { path: "Dockerfile.lara" }, ok: true }],
      diffs: [{ path: "Dockerfile.lara", patch: "..." }],
    };

    expect(
      shouldShowJobCard({
        runId: "run-1",
        progress,
        isQualifyOnly: false,
        isAgentJobMessage: false,
        hasExecutionEvidence: true,
        slotActive: true,
        activeRunId: "run-1",
      }),
    ).toBe(true);
  });

  it("job materializado permanece com mini-card após terminar", () => {
    expect(
      shouldShowJobCard({
        runId: "run-1",
        progress: {
          ...initialAgentProgress,
          finished: true,
          lastFinishOk: true,
          narrationText: "Vou criar a landing.",
          streamText: "Pronto!",
        },
        isQualifyOnly: false,
        isAgentJobMessage: true,
        hasExecutionEvidence: true,
        slotActive: false,
        activeRunId: null,
      }),
    ).toBe(true);
  });

  it("img 9: Running command (shell_exec ativo) mostra mini-card", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute",
      finished: false,
      tools: [{ name: "shell_exec", args: { command: "deploy" } }],
    };

    expect(
      shouldShowJobCard({
        runId: "run-1",
        progress,
        isQualifyOnly: false,
        isAgentJobMessage: false,
        hasExecutionEvidence: true,
        slotActive: true,
        activeRunId: "run-1",
      }),
    ).toBe(true);
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
        {
          type: "phase",
          data: { phase: "execute", message: "Implementando layout" },
          timestamp: 1,
        },
        {
          type: "tool_start",
          data: { name: "fs_read", args: { path: "src/App.tsx" } },
          timestamp: 2,
        },
      ],
    };
    const timeline = buildForgeTimeline(progress.timeline, true);
    const briefings = collectMiniCardBriefings(progress, timeline, [], true);

    expect(briefings.some((b) => b.includes("Lendo App.tsx"))).toBe(true);
    expect(briefings.some((b) => b.includes("Entendi que você quer"))).toBe(false);
  });

  it("deriveBrainstormTitle permanece utilitário; sessão ativa usa Working", () => {
    const progress = {
      ...initialAgentProgress,
      finished: false,
      phase: "gather",
    };

    expect(deriveBrainstormTitle("quero um app mobile para padaria")).toBe(
      "Brainstorm de app mobile para padaria",
    );
    expect(deriveSessionTitle(progress, null, "quero um app mobile")).toBe("Working");
  });

  it("resolveLatencyThinking — ativo antes do 1º token", () => {
    const startedAt = Date.now() - 1500;
    expect(
      resolveLatencyThinking(
        { ...initialAgentProgress, phase: "classify", finished: false },
        true,
        startedAt,
      )?.active,
    ).toBe(true);
  });

  it("resolveLatencyThinking — congela e permanece após 1º thinking:true", () => {
    const startedAt = Date.now() - 1500;
    const frozen = resolveLatencyThinking(
      {
        ...initialAgentProgress,
        finished: false,
        timeline: [
          {
            type: "assistant_text",
            data: { text: "Analisando…", thinking: true, delta: true },
            timestamp: Date.now(),
          },
        ],
      },
      true,
      startedAt,
      buildForgeTimeline(
        [
          {
            type: "assistant_text",
            data: { text: "Analisando…", thinking: true, delta: true },
            timestamp: Date.now(),
          },
        ],
        true,
      ),
    );
    expect(frozen?.active).toBe(false);
    expect(frozen?.durationMs).toBeGreaterThanOrEqual(500);
  });

  it("resolveLatencyThinking — reidrata latencyThoughtMs do progress", () => {
    const lat = resolveLatencyThinking(
      { ...initialAgentProgress, latencyThoughtMs: 3200 },
      false,
      null,
    );
    expect(lat?.active).toBe(false);
    expect(lat?.durationMs).toBe(3200);
  });

  it("narration line persiste no chat quando terminal com stream distinto", () => {
    const view = buildAgentRunView("run-1", {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      streamText: "Pronto!",
      narrationText: "Vou criar a landing com Hero e CTA.",
    });
    expect(view.closingText).toBe("Pronto!");
    expect(view.narration).toBe("Vou criar a landing com Hero e CTA.");
  });

  it("closingText inclui narrationText quando terminal sem streamText", () => {
    const view = buildAgentRunView("run-1", {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
      narrationText: "Vou criar a landing com Hero e CTA.",
    });
    expect(view.closingText).toContain("Vou criar a landing");
    expect(view.narration).toBe("Vou criar a landing com Hero e CTA.");
  });

  it("latencyThinking ativo antes do 1º token com runStartedAtMs", () => {
    const startedAt = Date.now() - 2000;
    const view = buildAgentRunView(
      "run-1",
      { ...initialAgentProgress, phase: "classify", finished: false },
      { running: true, runStartedAtMs: startedAt, userPrompt: "landing page" },
    );
    expect(view.latencyThinking?.active).toBe(true);
    expect(view.latencyThinking?.startedAtMs).toBe(startedAt);
    expect(view.reasoningThought).toBeNull();
  });

  it("latencyThinking congela após 1º token; reasoningThought só com thinking:true", () => {
    const withStream = buildAgentRunView(
      "run-1",
      {
        ...initialAgentProgress,
        phase: "execute",
        streamText: "Vou criar a landing.",
        finished: false,
      },
      { running: true, runStartedAtMs: Date.now() - 3000 },
    );
    expect(withStream.latencyThinking?.active).toBe(false);
    expect(withStream.latencyThinking?.durationMs).toBeGreaterThanOrEqual(500);

    const withReasoning = buildAgentRunView(
      "run-1",
      {
        ...initialAgentProgress,
        finished: false,
        timeline: [
          {
            type: "assistant_text",
            data: { text: "Analisando stack…", thinking: true, delta: true },
            timestamp: Date.now() - 4000,
          },
        ],
      },
      { running: true, runStartedAtMs: Date.now() - 5000 },
    );
    expect(withReasoning.reasoningThought?.active).toBe(true);
    expect(withReasoning.latencyThinking?.active).toBe(false);
    expect(withReasoning.latencyThinking?.durationMs).toBeGreaterThanOrEqual(500);
  });

  it("filtra mensagens genéricas de gather/explorando", () => {
    expect(normalizeMiniCardBriefing("Explorando 48 arquivos…")).toBeNull();
    expect(normalizeMiniCardBriefing("Explorando o projeto")).toBeNull();
    expect(normalizeMiniCardBriefing("Analisando o projeto")).toBeNull();
    expect(normalizeMiniCardBriefing("Lendo arquivos do projeto...")).toBeNull();
    expect(normalizeMiniCardBriefing("Indexando 12 arquivos…")).toBeNull();
  });

  it("briefings incluem tool pendente na fase gather", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute",
      tools: [{ name: "fs_read", args: { path: "src/App.tsx" } }],
      timeline: [],
    };
    const briefings = collectMiniCardBriefings(progress, [], [], true, {
      userPrompt: "landing page",
    });
    expect(briefings.some((b) => b.includes("Lendo App.tsx"))).toBe(true);
    expect(briefings.some((b) => b.includes("Lendo App.tsx"))).toBe(true);
  });

  it("run ativo não expõe briefings genéricos de gather no mini card", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "gather",
      message: "Analisando estrutura",
      timeline: [
        { type: "explore", data: { message: "Explorando o projeto", phase: "gather" }, timestamp: 1 },
        { type: "memory", data: { message: "Lendo package.json" }, timestamp: 2 },
      ],
    };
    const view = buildAgentRunView("run-1", progress, { running: true });
    expect(
      view.miniCard.liveBriefings.some((b) =>
        /package\.json|Analisando|Explorando|Lendo arquivos/i.test(b),
      ),
    ).toBe(false);
  });
});
