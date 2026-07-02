import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAgentProgressEvent, awaitingKindFromRunMeta } from "@/lib/agent-progress";
import type { AgentProgress, SSEEvent } from "@/lib/agent-progress";
import { clearDiagnostics, getDiagnostics } from "@/hooks/useDiagnostics";
import { TASTE_UI_EVENT } from "@/lib/taste-ui-actions";

const base: AgentProgress = {
  phase: null,
  message: null,
  currentStep: null,
  totalSteps: null,
  tools: [],
  cost: 0,
  model: null,
  skills: [],
  runtimeChecks: [],
  timeline: [],
  summary: null,
  error: "falhou",
  finished: true,
  resumable: true,
  statusHint: null,
  streamText: null,
  lastFinishOk: null,
  pendingQueueCount: 0,
  diffs: [],
  pendingPlan: null,
};

function ev(type: string, data: Record<string, unknown>): SSEEvent {
  return { type, data, timestamp: 0 };
}

describe("awaitingKindFromRunMeta", () => {
  it("lê clarify do meta.awaitingUser", () => {
    expect(awaitingKindFromRunMeta({ awaitingUser: { type: "clarify" } })).toBe("clarify");
  });

  it("legado qualify no meta → clarify", () => {
    expect(awaitingKindFromRunMeta({ awaitingUser: { type: "qualify" } })).toBe("clarify");
  });

  it("lê plan_approval do meta.awaitingUser", () => {
    expect(awaitingKindFromRunMeta({ awaitingUser: { type: "plan_approval", planId: "p1" } })).toBe(
      "plan_approval",
    );
  });

  it("retorna null sem awaitingUser", () => {
    expect(awaitingKindFromRunMeta({})).toBeNull();
  });
});

describe("applyAgentProgressEvent", () => {
  it("start limpa erro e resumable", () => {
    const next = applyAgentProgressEvent(base, ev("start", { resume: true }));
    expect(next.error).toBeNull();
    expect(next.resumable).toBe(false);
    expect(next.finished).toBe(false);
    expect(next.statusHint).toBe("Trabalhando no projeto…");
  });

  it("opening:true vai para narrationText, não streamText", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false, error: null },
      ev("assistant_text", { text: "Vou montar o hero.", opening: true }),
    );
    expect(next.narrationText).toBe("Vou montar o hero.");
    expect(next.streamText).toBeNull();
  });

  it("start zera streamText e narration do run anterior", () => {
    const stale = {
      ...base,
      streamText: "Plano: landing viva e convertendo",
      narrationText: "Vou montar o plano.",
      workingDurationMs: 83_000,
      timeline: [ev("phase", { phase: "creating_plan" })],
    };
    const next = applyAgentProgressEvent(stale, ev("start", {}));
    expect(next.streamText).toBeNull();
    expect(next.narrationText).toBeNull();
    expect(next.workingDurationMs).toBeNull();
    expect(next.timeline).toHaveLength(1);
    expect(next.timeline[0]?.type).toBe("start");
  });

  it("finish ok encerra sem resumable", () => {
    const next = applyAgentProgressEvent(base, ev("finish", { ok: true, resumable: true }));
    expect(next.finished).toBe(true);
    expect(next.resumable).toBe(false);
    expect(next.error).toBeNull();
  });

  it("finish com falha mantém resumable", () => {
    const next = applyAgentProgressEvent(
      base,
      ev("finish", { ok: false, error: "timeout", resumable: true }),
    );
    expect(next.finished).toBe(true);
    expect(next.resumable).toBe(true);
    expect(next.error).toBe("timeout");
  });

  it("error recoverable marca resumable", () => {
    const next = applyAgentProgressEvent(
      { ...base, resumable: false },
      ev("error", { error: "x", recoverable: true }),
    );
    expect(next.resumable).toBe(true);
    expect(next.finished).toBe(true);
  });

  it("plan_proposed popula pendingPlan quando runId/projectId presentes", () => {
    const next = applyAgentProgressEvent(
      base,
      ev("plan_proposed", {
        planId: "p-123",
        summary: "Plano de teste",
        steps: [{ id: "s1", type: "create_file", description: "criar", enabled: true }],
        ttlMs: 60_000,
        runId: "run-1",
        projectId: "proj-1",
      }),
    );
    expect(next.pendingPlan).not.toBeNull();
    expect(next.pendingPlan?.planId).toBe("p-123");
    expect(next.pendingPlan?.steps).toHaveLength(1);
    expect(next.pendingPlan?.runId).toBe("run-1");
    expect(next.pendingPlan?.projectId).toBe("proj-1");
    expect(next.planSummary).toBe("Plano de teste");
    expect(next.statusHint).toContain("aprovação");
  });

  it("done com planProposed hidrata pendingPlan do payload plan", () => {
    const done = applyAgentProgressEvent(
      { ...base, finished: false },
      ev("done", {
        planProposed: true,
        summary: "Landing page",
        plan: {
          planId: "p-99",
          summary: "Landing page",
          steps: [{ id: "s1", type: "create_file", description: "Hero", enabled: true }],
          runId: "run-9",
          projectId: "proj-9",
        },
      }),
    );
    expect(done.pendingPlan?.planId).toBe("p-99");
    expect(done.awaitingKind).toBe("plan_approval");
    expect(done.finished).toBe(false);
    expect(done.awaiting).toBe(true);
  });

  it("done com planProposed mantém pendingPlan e awaitingKind", () => {
    const withPlan = applyAgentProgressEvent(
      { ...base, finished: false },
      ev("plan_proposed", {
        planId: "p-123",
        summary: "Plano de teste",
        steps: [{ id: "s1", type: "create_file", description: "criar", enabled: true }],
        runId: "run-1",
        projectId: "proj-1",
      }),
    );
    const done = applyAgentProgressEvent(
      withPlan,
      ev("done", { planProposed: true, summary: "Plano de teste" }),
    );
    expect(done.pendingPlan).not.toBeNull();
    expect(done.awaiting).toBe(true);
    expect(done.awaitingKind).toBe("plan_approval");
    expect(done.finished).toBe(false);
  });

  it("plan_proposed sem runId/projectId não popula pendingPlan", () => {
    const next = applyAgentProgressEvent(
      base,
      ev("plan_proposed", {
        planId: "p-123",
        summary: "Plano",
        steps: [{ id: "s1", type: "custom", description: "x", enabled: true }],
        ttlMs: 60_000,
      }),
    );
    expect(next.pendingPlan).toBeNull();
  });

  it("tool_done fecha só a última tool pendente do mesmo nome", () => {
    let state = applyAgentProgressEvent(
      { ...base, finished: false },
      ev("tool_start", { name: "fs_read", args: { path: "a.ts" } }),
    );
    state = applyAgentProgressEvent(
      state,
      ev("tool_start", { name: "fs_read", args: { path: "b.ts" } }),
    );
    state = applyAgentProgressEvent(state, ev("tool_done", { name: "fs_read", ok: true }));
    expect(state.tools[0]?.ok).toBeUndefined();
    expect(state.tools[1]?.ok).toBe(true);
  });

  it("classify legado ignorado no reducer (só timeline)", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false, streamText: null, model: null },
      ev("classify", { summary: "Landing de cafeteria", model: "gpt-4" }),
    );
    expect(next.streamText).toBeNull();
    expect(next.model).toBeNull();
    expect(next.timeline).toHaveLength(1);
  });

  it("build_log acumula linhas no progress", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false },
      ev("build_log", {
        command: "./gradlew assembleDebug",
        lines: ["> Task :app:compileDebugKotlin", "BUILD SUCCESSFUL"],
        ok: true,
      }),
    );
    expect(next.buildLogLines).toHaveLength(2);
    expect(next.buildLogLines?.[1]?.line).toBe("BUILD SUCCESSFUL");
  });

  it("stack_fork_suggested popula stackForkSuggested", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false },
      ev("stack_fork_suggested", {
        path: "app/build.gradle.kts",
        suggestedStack: "android-native",
        message: "Fork sugerido",
      }),
    );
    expect(next.stackForkSuggested?.path).toBe("app/build.gradle.kts");
    expect(next.stackForkSuggested?.message).toBe("Fork sugerido");
  });

  it("assistant_text com delta faz append token a token", () => {
    const first = applyAgentProgressEvent(
      { ...base, finished: false, streamText: "Olá" },
      ev("assistant_text", { text: " mundo", delta: true }),
    );
    expect(first.streamText).toBe("Olá mundo");
  });

  it("assistant_text narration não polui streamText", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false, streamText: "Resposta real" },
      ev("assistant_text", { text: "Primeiro passo…", narration: true }),
    );
    expect(next.streamText).toBe("Resposta real");
  });

  it("assistant_text thinking não polui streamText", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false, streamText: "Resposta real" },
      ev("assistant_text", { text: "Vou", delta: true, thinking: true }),
    );
    expect(next.streamText).toBe("Resposta real");
  });

  it("assistant_text thinking vai à timeline, não à narração do chat", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false },
      ev("assistant_text", { text: "Entendi", delta: true, thinking: true }),
    );
    expect(next.narrationText).toBeFalsy();
    expect(next.streamText).toBeNull();
    expect(next.timeline).toHaveLength(1);
  });

  it("done preserva streamText completo", () => {
    const next = applyAgentProgressEvent(
      {
        ...base,
        finished: false,
        streamText: "Vou criar a landing completa.",
      },
      ev("done", { summary: "**Pronto!** Resumo do que fiz:\n\nNenhum arquivo." }),
    );
    expect(next.streamText).toBe("Vou criar a landing completa.");
    expect(next.summary).toContain("Pronto");
  });

  it("done não injeta template robótico no streamText quando vazio", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false, streamText: null },
      ev("done", {
        summary: "**Pronto!** Resumo do que fiz:\n\nNenhum arquivo foi alterado nesta rodada.",
      }),
    );
    expect(next.streamText).toBeNull();
  });

  it("heartbeat atualiza statusHint", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false },
      ev("heartbeat", { message: "Ainda processando o modelo…" }),
    );
    expect(next.statusHint).toContain("processando");
  });

  it("explore atualiza mensagem sem poluir phase", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false },
      ev("explore", { message: "Lendo package.json, src/App.tsx…", paths: ["package.json"] }),
    );
    expect(next.phase).toBeNull();
    expect(next.message).toContain("package.json");
  });

  it("done com planRejected limpa pendingPlan", () => {
    const withPlan = applyAgentProgressEvent(
      base,
      ev("plan_proposed", {
        planId: "p-1",
        summary: "s",
        steps: [{ id: "s1", type: "custom", description: "x", enabled: true }],
        ttlMs: 60_000,
        runId: "r1",
        projectId: "p1",
      }),
    );
    expect(withPlan.pendingPlan).not.toBeNull();
    const withDiff = applyAgentProgressEvent(
      base,
      ev("file_diff", { path: "src/App.tsx", before: "", after: "x", op: "write" }),
    );
    expect(withDiff.previewSyncTick).toBe(1);

    const cleared = applyAgentProgressEvent(withPlan, ev("done", { planRejected: true }));
    expect(cleared.pendingPlan).toBeNull();
  });

  it("thinking_text acumula em privateThoughtText, não vira streamText/narrationText", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false, error: null },
      ev("thinking_text", { text: "I need to ", append: true, delta: true }),
    );
    expect(next.privateThoughtText).toBe("I need to ");
    expect(next.streamText).toBeFalsy();
    expect(next.narrationText).toBeFalsy();

    const next2 = applyAgentProgressEvent(
      next,
      ev("thinking_text", { text: "investigate.", append: true, delta: true }),
    );
    expect(next2.privateThoughtText).toBe("I need to investigate.");
    expect(next2.streamText).toBeFalsy();
    expect(next2.narrationText).toBeFalsy();
  });

  it("thinking_text entra na timeline (reidratação)", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false, error: null },
      ev("thinking_text", { text: "check deps", append: true, delta: true }),
    );
    expect(next.timeline).toHaveLength(1);
    expect(next.timeline[0]?.type).toBe("thinking_text");
  });

  it("thinking:true legado não vira streamText (regressão Gap 1)", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false, error: null },
      ev("assistant_text", { text: "I need to investigate...", thinking: true, append: true }),
    );
    expect(next.streamText).toBeFalsy();
    expect(next.narrationText).toBeFalsy();
  });
});

// ─── Session 2.0 — contrato canônico ───────────────────────────────────────
// Testes RED que documentam as divergências produtor→consumidor.
// Devem passar após a Frente B (receptor) + Frente C (emissor) serem
// implementadas. Veja docs/AGENT_RUN_STABILIZATION.md — Session 2.0.

describe("Session 2.0 — contrato agent_run", () => {
  beforeEach(() => {
    clearDiagnostics();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("B1 — step sem plan:true atualiza progresso (build normal)", () => {
    it("step sem plan atualiza currentStep/totalSteps (build não-planejado)", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false },
        ev("step", { current: 7, total: 60 }),
      );
      expect(next.currentStep).toBe(7);
      expect(next.totalSteps).toBe(60);
    });

    it("step com plan:true continua atualizando (plan aprovado)", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false },
        ev("step", { current: 3, total: 5, plan: true }),
      );
      expect(next.currentStep).toBe(3);
      expect(next.totalSteps).toBe(5);
    });
  });

  describe("B2 — done deixa de ser terminal (só sumário/tokens/cost)", () => {
    it("done NÃO seta finished (terminal virou responsabilidade do finish)", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false, error: null },
        ev("done", { summary: "Pronto." }),
      );
      expect(next.finished).toBe(false);
      expect(next.summary).toBe("Pronto.");
    });

    it("done propaga totalTokens e costUsd para progress", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false, error: null },
        ev("done", {
          summary: "Pronto.",
          totalInputTokens: 1000,
          totalOutputTokens: 500,
          totalTokens: 1500,
          costUsd: 0.012,
        }),
      );
      expect(next.tokens).toEqual({ input: 1000, output: 500, total: 1500 });
      expect(next.cost).toBeCloseTo(0.012, 5);
    });
  });

  describe("B3 — finish enriquecido (terminal canônico)", () => {
    it("finish ok seta terminal + sumário + tokens + cost", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false, error: null },
        ev("finish", {
          ok: true,
          summary: "Landing criada.",
          totalInputTokens: 2000,
          totalOutputTokens: 800,
          totalTokens: 2800,
          costUsd: 0.025,
        }),
      );
      expect(next.finished).toBe(true);
      expect(next.lastFinishOk).toBe(true);
      expect(next.summary).toBe("Landing criada.");
      expect(next.tokens).toEqual({ input: 2000, output: 800, total: 2800 });
      expect(next.cost).toBeCloseTo(0.025, 5);
    });

    it("finish com erro não resumable marca failed", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false, error: null },
        ev("finish", {
          ok: false,
          error: "Loop budget exausto",
          resumable: false,
        }),
      );
      expect(next.finished).toBe(true);
      expect(next.lastFinishOk).toBe(false);
      expect(next.resumable).toBe(false);
      expect(next.error).toContain("budget");
    });
  });

  describe("B4 — plan_proposed com design + ttlMs + proposedAt", () => {
    it("plan_proposed com design popula pendingPlan.design", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false },
        ev("plan_proposed", {
          planId: "p-1",
          summary: "Landing page",
          steps: [{ id: "s1", type: "create_file", description: "Hero", enabled: true }],
          runId: "r1",
          projectId: "p1",
          design: {
            voice: ["bold", "kinetic"],
            moment: "Hero com parallax",
            techniques: ["parallax", "grid-asymmetry"],
            mood: "vibrant",
          },
          ttlMs: 120_000,
          proposedAt: "2026-06-21T18:00:00.000Z",
        }),
      );
      expect(next.pendingPlan?.design).not.toBeNull();
      expect(next.pendingPlan?.design?.voice).toEqual(["bold", "kinetic"]);
      expect(next.pendingPlan?.design?.moment).toBe("Hero com parallax");
      expect(next.pendingPlan?.design?.mood).toBe("vibrant");
      expect(next.pendingPlan?.ttlMs).toBe(120_000);
      expect(next.pendingPlan?.proposedAt).toBe(Date.parse("2026-06-21T18:00:00.000Z"));
    });

    it("plan_proposed sem ttlMs usa fallback 60s (não MAX_SAFE_INTEGER)", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false },
        ev("plan_proposed", {
          planId: "p-1",
          summary: "Plano",
          steps: [{ id: "s1", type: "custom", description: "x", enabled: true }],
          runId: "r1",
          projectId: "p1",
        }),
      );
      expect(next.pendingPlan?.ttlMs).toBe(60_000);
    });
  });

  describe("B6 — stuck / run_paused", () => {
    it("stuck atualiza statusHint com mensagem de modelo preso", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false, statusHint: null },
        ev("stuck", { message: "Modelo preso em leitura — forçando saída", reason: "read-only-loop" }),
      );
      expect(next.statusHint).toContain("preso");
    });

    it("run_paused marca resumable", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false, resumable: false },
        ev("run_paused", {
          reason: "platform_limit",
          message: "Execução longa — clique Continuar para seguir de onde parou",
        }),
      );
      expect(next.resumable).toBe(true);
      expect(next.statusHint?.toLowerCase()).toContain("continuar");
    });
  });

  describe("B7 — tool_done correlaciona por toolCallId", () => {
    it("tool_done por toolCallId fecha a tool correta em paralelo", () => {
      let state = applyAgentProgressEvent(
        { ...base, finished: false },
        ev("tool_start", { name: "fs_read", args: { path: "a.ts" }, toolCallId: "tc-1" }),
      );
      state = applyAgentProgressEvent(
        state,
        ev("tool_start", { name: "fs_read", args: { path: "b.ts" }, toolCallId: "tc-2" }),
      );
      state = applyAgentProgressEvent(
        state,
        ev("tool_done", { name: "fs_read", ok: true, toolCallId: "tc-2" }),
      );
      expect(state.tools[0]?.ok).toBeUndefined();
      expect(state.tools[1]?.ok).toBe(true);
    });

    it("tool_done sem toolCallId mantém comportamento legado (por nome)", () => {
      let state = applyAgentProgressEvent(
        { ...base, finished: false },
        ev("tool_start", { name: "fs_read", args: { path: "a.ts" } }),
      );
      state = applyAgentProgressEvent(state, ev("tool_done", { name: "fs_read", ok: true }));
      expect(state.tools[0]?.ok).toBe(true);
    });
  });

  describe("B8 — cases mortos removidos (resume/memory)", () => {
    it("resume event NÃO tem handler dedicado (cai em default, só timeline)", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: true, error: "x" },
        ev("resume", {}),
      );
      expect(next.finished).toBe(true);
      expect(next.error).toBe("x");
      expect(next.timeline).toHaveLength(1);
    });

    it("memory event NÃO tem handler dedicado (cai em default, só timeline)", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false, statusHint: "Trabalhando…" },
        ev("memory", { message: "x" }),
      );
      expect(next.statusHint).toBe("Trabalhando…");
      expect(next.timeline).toHaveLength(1);
    });
  });

  describe("B9 — ui_action dispatcha evento Taste", () => {
    it("ui_action open_connector dispatcha CustomEvent no window", () => {
      const dispatched: CustomEvent[] = [];
      const fakeWindow = {
        dispatchEvent: (e: CustomEvent) => {
          dispatched.push(e);
          return true;
        },
      };
      vi.stubGlobal("window", fakeWindow);
      applyAgentProgressEvent(
        { ...base, finished: false },
        ev("ui_action", {
          action: "open_connector",
          connector: "anthropic",
          reason: "Configure sua chave",
        }),
      );
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]?.type).toBe(TASTE_UI_EVENT);
      expect(dispatched[0]?.detail).toMatchObject({
        action: "open_connector",
        connector: "anthropic",
      });
      vi.unstubAllGlobals();
    });
  });

  describe("terminalPhase", () => {
    it("done build entra em closing sem finished", () => {
      const next = applyAgentProgressEvent(
        { ...base, finished: false, error: null, resumable: false },
        ev("done", { summary: "Concluí o hero." }),
      );
      expect(next.terminalPhase).toBe("closing");
      expect(next.finished).toBe(false);
    });

    it("finish promove para terminal", () => {
      const state = applyAgentProgressEvent(
        { ...base, finished: false, error: null, terminalPhase: "closing" },
        ev("finish", { ok: true }),
      );
      expect(state.terminalPhase).toBe("terminal");
      expect(state.finished).toBe(true);
    });
  });
});
