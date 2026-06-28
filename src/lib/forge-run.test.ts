import { describe, expect, it } from "vitest";
import { initialAgentProgress, type PendingPlan } from "@/lib/agent-progress";
import {
  buildAgentRunView,
  buildForgeTimeline,
  collectMiniCardBriefings,
  normalizeMiniCardBriefing,
  deriveBrainstormTitle,
  deriveSessionTitle,
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

describe("buildForgeTimeline", () => {
  it("não inclui mensagem do usuário nem passo interno X/Y", () => {
    const items = buildForgeTimeline(
      [
        {
          type: "phase",
          data: { phase: "build", message: "Crie uma landing de padaria com hero quente" },
          timestamp: 1,
        },
        {
          type: "phase",
          data: { phase: "execute", message: "Executando passo 1 de 15…" },
          timestamp: 2,
        },
        {
          type: "tool_start",
          data: { name: "fs_read", args: { path: "src/App.tsx" } },
          timestamp: 3,
        },
      ],
      true,
    );
    expect(items.some((i) => i.type === "TASK")).toBe(false);
    expect(items.some((i) => i.type === "READ" && i.path === "App.tsx")).toBe(true);
  });

  it("higieniza eventos internos e mantém eventos qualificados", () => {
    const items = buildForgeTimeline([
      { type: "classify", data: { model: "Kimi 2.6" }, timestamp: 1 },
      { type: "fsm_transition", data: { to: "build" }, timestamp: 2 },
      { type: "checkpoint_resume", data: {}, timestamp: 3 },
      { type: "delivery_checkpoint_silent", data: {}, timestamp: 4 },
      { type: "delivery_checkpoint", data: { files: [] }, timestamp: 5 },
      {
        type: "skills",
        data: { active: ["react-tailwind"], stack: ["react-tailwind"] },
        timestamp: 6,
      },
      { type: "explore", data: { message: "Continuando (parte 1/12)…" }, timestamp: 7 },
      {
        type: "phase",
        data: { phase: "checkpoint", message: "Concluído: rodar `npm run build` (passo 3/70)." },
        timestamp: 8,
      },
      { type: "robin_rotate", data: {}, timestamp: 9 },
      { type: "delivery_checkpoint", data: { deliveryFiles: ["src/App.tsx"] }, timestamp: 10 },
      {
        type: "skills",
        data: { user: ["design-system"], invoked: ["design-system"] },
        timestamp: 11,
      },
    ]);

    const visible = items
      .map((item) => {
        if ("label" in item) return item.label;
        if ("text" in item) return item.text;
        if ("name" in item) return item.name;
        if ("title" in item) return item.title;
        if ("command" in item) return item.command;
        if ("path" in item) return item.path;
        return "";
      })
      .join(" ");
    expect(visible).not.toMatch(
      /Classificando|Kimi|Estado|Continuando|parte 1\/12|passo 3\/70|Skills:|Checkpoint salvo/i,
    );
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
        isClarifyOnly: false,
        isAgentJobMessage: true,
        hasExecutionEvidence: false,
        slotActive: false,
        activeRunId: "run-1",
      }),
    ).toBe(false);
  });
  it("run ativa: mini-card no primeiro token", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "build",
      finished: false,
      message: "Checking browser route wiring in lara-workspace",
      statusHint: "Diagnosing Lara container gaps and needs",
    };

    expect(
      shouldShowJobCard({
        runId: "run-1",
        progress,
        isClarifyOnly: false,
        isAgentJobMessage: false,
        hasExecutionEvidence: true,
        slotActive: true,
        activeRunId: "run-1",
      }),
    ).toBe(true);
  });

  it("oculta mini card em turno clarify-only", () => {
    const progress = {
      ...initialAgentProgress,
      awaitingKind: "clarify" as const,
      awaiting: true,
      finished: true,
    };

    expect(
      shouldShowJobCard({
        runId: "run-1",
        progress,
        isClarifyOnly: true,
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
      diffs: [
        {
          id: "diff-1",
          path: "Dockerfile.lara",
          before: "",
          after: "...",
          op: "edit" as const,
          timestamp: 1,
        },
      ],
    };

    expect(
      shouldShowJobCard({
        runId: "run-1",
        progress,
        isClarifyOnly: false,
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
        isClarifyOnly: false,
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
        isClarifyOnly: false,
        isAgentJobMessage: false,
        hasExecutionEvidence: true,
        slotActive: true,
        activeRunId: "run-1",
      }),
    ).toBe(true);
  });
});

describe("hasActiveJob — sem fantasma no mount", () => {
  it("autoResuming sozinho não é job ativo", () => {
    const progress = {
      ...initialAgentProgress,
      autoResuming: true,
      finished: false,
      phase: "build",
    };
    expect(isRunEffectivelyActive(progress, false)).toBe(false);
    expect(
      shouldShowJobCard({
        runId: "run-1",
        progress,
        isClarifyOnly: false,
        isAgentJobMessage: false,
        hasExecutionEvidence: true,
        slotActive: false,
      }),
    ).toBe(false);
  });

  it("job ativo exige running e slotActive", () => {
    const progress = { ...initialAgentProgress, finished: false, phase: "execute" };
    expect(isRunEffectivelyActive(progress, true)).toBe(true);
    expect(isRunEffectivelyActive(progress, false)).toBe(false);
  });

  it("normalizeMiniCardBriefing filtra retomando automaticamente", () => {
    expect(normalizeMiniCardBriefing("Retomando automaticamente no servidor…")).toBeNull();
  });

  it("collectMiniCardBriefings vazio sem job ativo", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "execute",
      tools: [{ name: "fs_edit", args: { path: "src/App.tsx" } }],
    };
    const timeline = buildForgeTimeline(
      [
        {
          type: "tool_start",
          data: { name: "fs_edit", args: { path: "src/App.tsx" } },
          timestamp: 1,
        },
      ],
      false,
    );
    expect(collectMiniCardBriefings(progress, timeline, false)).toEqual([]);
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

  it("abertura/opening não vira THOUGHT no inspector", () => {
    const items = buildForgeTimeline(
      [
        {
          type: "assistant_text",
          data: { text: "Vou montar o hero da oficina.", opening: true },
          timestamp: 1,
        },
        {
          type: "assistant_text",
          data: { text: "Montando landing.", narration: true },
          timestamp: 2,
        },
      ],
      true,
    );
    expect(items.some((i) => i.type === "THOUGHT")).toBe(false);
  });

  it("step_result vira RESULT na timeline", () => {
    const items = buildForgeTimeline(
      [
        {
          type: "step_result",
          data: { summary: "Build OK (gate final)", ok: true, evidence: ["Compilação OK"] },
          timestamp: 1,
        },
      ],
      false,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe("RESULT");
    if (items[0]?.type === "RESULT") {
      expect(items[0].text).toContain("Build OK");
      expect(items[0].ok).toBe(true);
    }
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
  });

  it("jobPlan vira checklist compacto no mini-card", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      lastFinishOk: true,
    };

    const view = buildAgentRunView("run-1", progress, {
      running: false,
      jobPlan: samplePlan,
    });

    expect(view.miniCard.hasPlan).toBe(true);
    expect(view.miniCard.tasks).toHaveLength(3);
    expect(view.miniCard.tasks?.every((task) => task.status === "done")).toBe(true);
    expect(view.miniCard.tasks?.[0]?.label).toContain("Hero section");
  });
});

describe("forge-run mini card briefing e título", () => {
  it("normalizeMiniCardBriefing bloqueia contrato interno do loop", () => {
    expect(normalizeMiniCardBriefing("Continuando (parte 1/12)…")).toBeNull();
    expect(normalizeMiniCardBriefing("State: building")).toBeNull();
    expect(normalizeMiniCardBriefing("Skills: react-tailwind, design-system")).toBeNull();
    expect(normalizeMiniCardBriefing("Próximo do limite de tempo da head function")).toBeNull();
  });

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
    const briefings = collectMiniCardBriefings(progress, timeline, true);

    expect(briefings.some((b) => b.includes("Lendo App.tsx"))).toBe(true);
    expect(briefings.some((b) => b.includes("Entendi que você quer"))).toBe(false);
  });

  it("deriveBrainstormTitle permanece utilitário; sessão ativa usa Working", () => {
    const progress = {
      ...initialAgentProgress,
      finished: false,
      phase: "build",
    };

    expect(deriveBrainstormTitle("quero um app mobile para padaria")).toBe(
      "Brainstorm de app mobile para padaria",
    );
    expect(deriveSessionTitle(progress, null, "quero um app mobile")).toBe("Working");
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
    const briefings = collectMiniCardBriefings(progress, [], true, {
      userPrompt: "landing page",
    });
    expect(briefings.some((b) => b.includes("Lendo App.tsx"))).toBe(true);
    expect(briefings.some((b) => b.includes("Lendo App.tsx"))).toBe(true);
  });

  it("run ativo não expõe briefings genéricos de explore/gather no mini card", () => {
    const progress = {
      ...initialAgentProgress,
      phase: "build",
      message: "Analisando estrutura",
      timeline: [
        {
          type: "explore",
          data: { message: "Explorando o projeto", phase: "gather" },
          timestamp: 1,
        },
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

  it("tool_done fecha READ ativo no forge timeline", () => {
    const items = buildForgeTimeline(
      [
        { type: "tool_start", data: { name: "web_search", args: {} }, timestamp: 1 },
        { type: "tool_done", data: { name: "web_search", ok: true }, timestamp: 2 },
      ],
      false,
    );
    const read = items.find((i) => i.type === "READ");
    expect(read?.type).toBe("READ");
    if (read?.type === "READ") {
      expect(read.active).toBe(false);
      expect(read.ok).toBe(true);
    }
  });

  it("thinking_text vira THOUGHT no inspector (PR 1 — Gap 1)", () => {
    const items = buildForgeTimeline(
      [
        {
          type: "thinking_text",
          data: { text: "Vou verificar o estado do container.", append: true, delta: true },
          timestamp: 1,
        },
        {
          type: "thinking_text",
          data: { text: " Talvez precise de docker compose build.", append: true, delta: true },
          timestamp: 2,
        },
      ],
      true,
    );
    const thought = items.find((i) => i.type === "THOUGHT");
    expect(thought).toBeDefined();
    if (thought?.type === "THOUGHT") {
      expect(thought.text).toContain("container");
      expect(thought.text).toContain("docker compose build");
      expect(thought.durationMs).toBeGreaterThanOrEqual(1000);
    }
  });

  it("deduplicates assistant_text thinking duplicated by thinking_text", () => {
    const items = buildForgeTimeline(
      [
        {
          type: "assistant_text",
          data: { text: "Vou", thinking: true, delta: true },
          timestamp: 1,
        },
        {
          type: "thinking_text",
          data: { text: "Vou", delta: true },
          timestamp: 1,
        },
        {
          type: "thinking_text",
          data: { text: " verificar o container.", delta: true },
          timestamp: 2,
        },
      ],
      true,
    );
    const thought = items.find((i) => i.type === "THOUGHT");
    expect(thought).toBeDefined();
    if (thought?.type === "THOUGHT") {
      expect(thought.text).toBe("Vou verificar o container.");
    }
  });
});

describe("timeline accountability (critério 1 — nada cai no vazio)", () => {
  it("evento de tipo desconhecido vira linha factual, nunca drop silencioso", () => {
    const items = buildForgeTimeline(
      [{ type: "tipo_que_nenhum_renderer_cobre", data: {}, timestamp: Date.now() }],
      false,
    );
    const row = items.at(-1);
    expect(row).toBeDefined();
    expect(row?.type).toBe("TASK");
  });

  it("fragmento delta de stream não vira NOTE (critério 2 — sem render absurdo)", () => {
    const items = buildForgeTimeline(
      [{ type: "assistant_text", data: { delta: true, text: "Pensando…" }, timestamp: Date.now() }],
      false,
    );
    expect(items.find((i) => i.type === "NOTE")).toBeUndefined();
    expect(items.find((i) => i.type === "THOUGHT")).toBeUndefined();
  });
});
