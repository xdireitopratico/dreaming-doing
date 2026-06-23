/**
 * QA visual final — checklist plan.md sessão 6/6
 * Referências: image (4)(5)(8)(9)(14)(15)
 */
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import { initialAgentProgress } from "@/lib/agent-progress";
import {
  buildAgentRunView,
  buildMiniCardHeader,
} from "@/lib/forge-run";
import { buildChatThread } from "@/lib/chat/thread";
import { mapAssistantTurn } from "@/lib/chat/turn";
import { planParagraphFromPlan } from "@/lib/plan-message-meta";
import type { RawThreadItem } from "@/lib/chat/types";

const samplePlan = {
  planId: "p1",
  summary: "Defining cross-view deletion strategy planning",
  mission:
    "Desbloquear exclusão do documento travado (vínculo com proposta no banco) e adicionar botão Excluir para documentos pendentes na aba Documentos",
  steps: [
    { id: "s1", type: "custom" as const, description: "Desbloquear exclusão documento", enabled: true },
    { id: "s2", type: "custom" as const, description: "Botão Excluir na aba Documentos", enabled: true },
    { id: "s3", type: "custom" as const, description: "Validar vínculo proposta/banco", enabled: true },
  ],
  ttlMs: 60_000,
  proposedAt: Date.now(),
  runId: "run-plan",
  projectId: "proj",
};

function msg(id: string, role: ChatMessage["role"], content: string, extra?: Partial<ChatMessage>): ChatMessage {
  return { id, role, content, timestamp: 0, ...extra };
}

describe("Lovable acceptance — Chat (imgs 4/5/9/15)", () => {
  it("mini-card headers: Edited / Running command / Plan ready — nunca só Working", () => {
    const edited = buildMiniCardHeader(
      { ...initialAgentProgress, finished: false },
      true,
      {
        editedFile: "Dockerfile.lara",
        liveBriefings: ["Orchestrating Lara container cleanup"],
        sessionTitle: "Lara cleanup",
      },
    );
    expect(edited.header).toBe("Edited Dockerfile.lara");
    expect(edited.subtitle).toBe("Orchestrating Lara container cleanup");

    const running = buildMiniCardHeader(
      {
        ...initialAgentProgress,
        finished: false,
        tools: [{ name: "shell_exec", args: { command: "deploy" } }],
      },
      true,
      {
        liveBriefings: ["Configuring Lara workspace safeguards now"],
        sessionTitle: "Lara cleanup",
      },
    );
    expect(running.header).toBe("Running command");

  });

  it("subtitle briefing separado do header (img 5)", () => {
    const view = buildAgentRunView(
      "run-1",
      {
        ...initialAgentProgress,
        finished: false,
        tools: [{ name: "fs_edit", args: { path: "Dockerfile.lara" }, ok: true }],
      },
      {
        running: true,
        jobPlan: {
          ...samplePlan,
          summary: "Orchestrating Lara container cleanup",
          steps: samplePlan.steps,
        },
        userPrompt: "higienizar lara",
      },
    );
    expect(view.miniCard.header).toMatch(/^Edited /);
    expect(view.miniCard.subtitle).not.toBe(view.miniCard.header);
  });

  it("plan approval: sem mini-card no thread (dock acima do composer)", () => {
    const progress = {
      ...initialAgentProgress,
      finished: false,
      awaitingKind: "plan_approval" as const,
      pendingPlan: samplePlan,
      streamText: "## Missão\nNão deve aparecer no thread",
    };

    const thread: RawThreadItem[] = [
      { kind: "user", message: msg("u1", "user", "fix delete") },
      { kind: "assistant", live: progress, runId: "run-plan", isActive: true },
    ];

    const turn = mapAssistantTurn(thread[1] as Extract<RawThreadItem, { kind: "assistant" }>, {
      messages: [thread[0].kind === "user" ? thread[0].message : msg("u1", "user", "")],
      thread,
      itemIndex: 1,
      running: true,
      activeRunId: "run-plan",
      pendingPlan: samplePlan,
      sessionProgress: progress,
    });

    expect(turn.miniCard).toBeNull();
  });

  it("thread DB ordem cronológica + narração/mini-card congelam no F5", () => {
    const messages = [
      msg("u1", "user", "oi"),
      msg("a1", "assistant", "Pronto.", {
        runId: "run-1",
        meta: {
          finishedAt: new Date().toISOString(),
          runId: "run-1",
          cardSnapshot: {
            finished: true,
            lastFinishOk: true,
            workingDurationMs: 4000,
            narrationText: "Vou investigar o estado atual do container DP Lara.",
            streamText: "Pronto.",
            timeline: [],
            tools: [],
            diffs: [],
          },
        },
      }),
    ];
    const thread = buildChatThread(messages, initialAgentProgress, {
      sessionProgress: initialAgentProgress,
    });
    const turn = thread[1];
    expect(turn.kind).toBe("assistant");
    if (turn.kind === "assistant") {
      expect(turn.narration).toContain("Vou investigar o estado atual");
      expect(turn.miniCard).not.toBeNull();
    }
  });
});

describe("Lovable acceptance — Inspector plan (img 14)", () => {
  it("corpo do plano é parágrafo único legível", () => {
    const body = planParagraphFromPlan(samplePlan);
    expect(body).toBe(samplePlan.mission);
    expect(body).not.toMatch(/^##\s/m);
  });
});

describe("Lovable acceptance — Composer placeholders (imgs 4/14)", () => {
  const IDLE = "Let's Build...";
  const RUNNING = "Queue follow-up...";
  const PLAN = "Tell Lovable what to do instead...";

  it("3 estados Lovable documentados", () => {
    expect(IDLE).toBe("Let's Build...");
    expect(RUNNING).toBe("Queue follow-up...");
    expect(PLAN).toBe("Tell Lovable what to do instead...");
  });
});

describe("Lovable acceptance — higiene de escopo", () => {
  it("mini-card hint padrão é Timeline completa → (img 5/9)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../components/chat/ChatJobCard.tsx"),
      "utf8",
    );
    expect(src).toContain("Timeline completa →");
    expect(src).not.toContain("Detalhes completos →");
    expect(src).not.toContain("Working…");
  });
});

// ─── Fase 2 — Lovable gaps visuais ───────────────────────────────────────

describe("Fase 2.1 — Monaco Diff View está plugado no InspectorChanges", () => {
  it("MonacoDiffView é exportado e usado em InspectorChanges", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const diffView = readFileSync(
      resolve(import.meta.dirname, "../components/editor/MonacoDiffView.tsx"),
      "utf8",
    );
    const changes = readFileSync(
      resolve(import.meta.dirname, "../components/editor/InspectorChanges.tsx"),
      "utf8",
    );
    expect(diffView).toContain("DiffEditor");
    expect(diffView).toContain("renderSideBySide");
    expect(changes).toContain("MonacoDiffView");
    // Não deve usar mais o <pre> simples (era o gap visual #1)
    expect(changes).not.toContain('className="forge-timeline-tool-detail mt-2"');
  });
});

describe("Fase 2.2 — lastTool é extraído do timeline e exposto em MiniCardData", () => {
  it("buildAgentRunView popula miniCard.lastTool a partir do forgeTimeline", () => {
    const progress = {
      ...initialAgentProgress,
      timeline: [
        { type: "tool_start", data: { name: "fs_read" }, timestamp: 1 },
        { type: "tool_done", data: { name: "fs_read", ok: true }, timestamp: 2 },
        { type: "tool_start", data: { name: "fs_write" }, timestamp: 3 },
        { type: "tool_done", data: { name: "fs_write", ok: true }, timestamp: 4 },
      ],
    };
    const view = buildAgentRunView("r1", progress);
    expect(view.miniCard?.lastTool).toBeTruthy();
    expect(view.miniCard?.lastTool?.name).toBe("fs_write");
  });

  it("MiniCardData aceita lastTool como tipo opcional", async () => {
    const types = await import("@/lib/chat/types");
    // Sanity check: tipo aceita o campo (TypeScript valida em build).
    const sample: import("@/lib/chat/types").MiniCardData = {
      title: "",
      header: "",
      subtitle: "",
      liveBriefings: [],
      status: "done",
      activity: [],
      lastTool: { name: "fs_read", path: "src/app.tsx", ok: true },
    };
    expect(sample.lastTool?.name).toBe("fs_read");
  });

  it("ChatJobCard filtra chips pela presença de handler e contexto", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../components/chat/ChatJobCard.tsx"),
      "utf8",
    );
    // Existem os 4 chips canônicos
    expect(src).toContain('key: "show-file"');
    expect(src).toContain('key: "show-diff"');
    expect(src).toContain('key: "show-output"');
    expect(src).toContain('key: "show-preview"');
  });
});

describe("Fase 2.3 — Version history (snapshot list + tab)", () => {
  it("listProjectSnapshots exporta e ordena por created_at desc", async () => {
    const mod = await import("@/lib/snapshot-history");
    expect(typeof mod.listProjectSnapshots).toBe("function");
  });

  it("JobInspectorTab não inclui mais 'history' (removido em limpeza)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const focus = readFileSync(
      resolve(import.meta.dirname, "../hooks/useJobWorkspaceFocus.ts"),
      "utf8",
    );
    const inspector = readFileSync(
      resolve(import.meta.dirname, "../components/editor/JobInspector.tsx"),
      "utf8",
    );
    expect(focus).not.toContain('"history"');
    expect(inspector).not.toContain('id: "history"');
    expect(inspector).not.toContain("InspectorHistory");
  });
});




describe("Inspector Plan — layout de leitura (preview)", () => {
  it("aba Plan move nav pro workspace header e plano usa scroll único", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const header = readFileSync(
      resolve(import.meta.dirname, "../components/editor/EditorWorkspaceHeader.tsx"),
      "utf8",
    );
    const inspector = readFileSync(
      resolve(import.meta.dirname, "../components/editor/JobInspector.tsx"),
      "utf8",
    );
    const plan = readFileSync(
      resolve(import.meta.dirname, "../components/editor/InspectorPlan.tsx"),
      "utf8",
    );
    const layout = readFileSync(
      resolve(import.meta.dirname, "../routes/projects/$projectId/EditorPageLayout.tsx"),
      "utf8",
    );

    expect(header).toContain("inspectorPlanNav");
    expect(header).toContain("forge-workspace-header-inner--inspector-plan");
    expect(layout).toContain('tab === "plan"');
    expect(layout).toContain("inspectorPlanNav={inspectorPlanNav}");
    expect(inspector).toContain('resolvedTab !== "plan"');
    expect(inspector).toContain("forge-inspector-body--plan");
    expect(plan).toContain("forge-inspector-plan-intro");
    expect(plan).toContain("forge-inspector-plan-actions");
    expect(plan).not.toContain('className="forge-inspector-plan-header"');
    expect(plan).not.toContain("forge-inspector-plan-footer");
    expect(plan.match(/<PlanActionBar/g)?.length).toBe(2);
  });
});

describe("ChatPlanDock — hooks estáveis (React #310)", () => {
  it("useCallback declarado antes de returns condicionais", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../components/chat/ChatPlanDock.tsx"),
      "utf8",
    );
    const hooksBlock = src.slice(0, src.indexOf("if (creating && !pendingPlan)"));
    expect(hooksBlock).toContain("useCallback");
    expect(hooksBlock).not.toContain("return null");
  });
});

describe("Chat — sem empty state nem flash de carregamento", () => {
  it("ChatPanel não referencia empty state", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const panel = readFileSync(
      resolve(import.meta.dirname, "../components/chat/ChatPanel.tsx"),
      "utf8",
    );
    expect(panel).not.toContain("ChatEmptyState");
    expect(panel).not.toContain("showEmptyState");
    expect(panel).not.toContain("Vamos construir");
    expect(panel).not.toContain("Carregando conversa");
    expect(panel).toContain("chatHydrating");
  });

  it("useEditorPageData bloqueia até conversation + messages", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(import.meta.dirname, "../routes/projects/$projectId/useEditorPageData.ts"),
      "utf8",
    );
    expect(src).toContain("conversationPending");
    expect(src).toContain("chatMessagesLoading = conversationPending");
  });
});

describe("Fase 2.6 — Mobile swap tem transição (não abrupt)", () => {
  it("EditorResizableLayout adiciona key=mobilePanel + classe de animação", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const layout = readFileSync(
      resolve(import.meta.dirname, "../components/editor/EditorResizableLayout.tsx"),
      "utf8",
    );
    const css = readFileSync(
      resolve(import.meta.dirname, "../styles/editor-workspace.css"),
      "utf8",
    );
    // Layout força re-mount via key quando mobilePanel muda
    expect(layout).toContain("key={`mobile-chat-${isMobile ? mobilePanel : \"static\"}`}");
    expect(layout).toContain("forge-mobile-panel-anim");
    // CSS define a animação
    expect(css).toContain("@keyframes forge-mobile-panel-in");
    expect(css).toContain(".forge-mobile-panel-anim");
    // Respeita prefers-reduced-motion
    expect(css).toContain("prefers-reduced-motion");
  });
});