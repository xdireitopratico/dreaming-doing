import { describe, expect, it } from "vitest";
import { applyAgentProgressEvent } from "@/lib/agent-progress";
import type { AgentProgress, SSEEvent } from "@/lib/agent-progress";

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
  autoResuming: false,
  pendingQueueCount: 0,
  diffs: [],
  pendingPlan: null,
};

function ev(type: string, data: Record<string, unknown>): SSEEvent {
  return { type, data, timestamp: 0 };
}

describe("applyAgentProgressEvent", () => {
  it("start com resume limpa erro e resumable", () => {
    const next = applyAgentProgressEvent(base, ev("start", { resume: true }));
    expect(next.error).toBeNull();
    expect(next.resumable).toBe(false);
    expect(next.finished).toBe(false);
    expect(next.statusHint).toContain("Retomando");
  });

  it("finish ok encerra sem resumable", () => {
    const next = applyAgentProgressEvent(base, ev("finish", { ok: true, resumable: true }));
    expect(next.finished).toBe(true);
    expect(next.resumable).toBe(false);
    expect(next.error).toBeNull();
  });

  it("finish com falha mantém resumable", () => {
    const next = applyAgentProgressEvent(base, ev("finish", { ok: false, error: "timeout", resumable: true }));
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
        steps: [
          { id: "s1", type: "create_file", description: "criar", enabled: true },
        ],
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
    expect(next.statusHint).toContain("aprovação");
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

  it("classify não polui streamText (planejamento interno)", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false, streamText: null },
      ev("classify", { summary: "Landing de cafeteria", model: "gpt-4" }),
    );
    expect(next.streamText).toBeNull();
    expect(next.model).toBe("gpt-4");
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

  it("delivery_checkpoint silencioso marca autoResuming sem pausar", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false, streamText: null },
      ev("delivery_checkpoint", {
        step: 3,
        totalSteps: 10,
        deliveryFiles: ["app/build.gradle.kts", "src/App.tsx"],
        narration: "Gradle configurado.",
        resumable: true,
        silent: true,
      }),
    );
    expect(next.currentStep).toBe(3);
    expect(next.totalSteps).toBe(10);
    expect(next.streamText).toBeNull();
    expect(next.narrationText).toBe("Gradle configurado.");
    expect(next.deliveryFiles).toEqual(["app/build.gradle.kts", "src/App.tsx"]);
    expect(next.autoResuming).toBe(true);
    expect(next.resumable).toBe(false);
    expect(next.finished).toBe(false);
  });

  it("heartbeat atualiza statusHint", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false },
      ev("heartbeat", { message: "Ainda processando o modelo…" }),
    );
    expect(next.statusHint).toContain("processando");
  });

  it("explore atualiza fase gather", () => {
    const next = applyAgentProgressEvent(
      { ...base, finished: false },
      ev("explore", { message: "Lendo package.json, src/App.tsx…", paths: ["package.json"] }),
    );
    expect(next.phase).toBe("gather");
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

    const withSync = applyAgentProgressEvent(withDiff, ev("preview_sync", { reason: "fs_change" }));
    expect(withSync.previewSyncTick).toBe(2);

    const cleared = applyAgentProgressEvent(
      withPlan,
      ev("done", { planRejected: true }),
    );
    expect(cleared.pendingPlan).toBeNull();
  });
});