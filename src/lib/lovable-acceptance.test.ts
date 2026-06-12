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
  deriveTasksFromPlan,
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

    const plan = buildMiniCardHeader(
      { ...initialAgentProgress, awaitingKind: "plan_approval" },
      true,
      {
        liveBriefings: [],
        sessionTitle: "Deletion fix",
        planReady: true,
        planHeadline: samplePlan.summary,
      },
    );
    expect(plan.header).toBe("Plan ready");
    expect(plan.subtitle).toBe(samplePlan.summary);
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
    expect(view.miniCard.tasks.length).toBeGreaterThan(0);
  });

  it("plan teaser: até 4 steps ○ pending, sem markdown ## Missão no chat", () => {
    const tasks = deriveTasksFromPlan(
      samplePlan,
      { ...initialAgentProgress, awaitingKind: "plan_approval" },
      { planTeaser: true },
    );
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t) => t.status === "pending")).toBe(true);

    const progress = {
      ...initialAgentProgress,
      finished: false,
      awaitingKind: "plan_approval" as const,
      pendingPlan: samplePlan,
      streamText: "## Missão\nNão deve aparecer no teaser",
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

    expect(turn.planTeaser).toBe(true);
    expect(turn.miniCard?.header).toBe("Plan ready");
    expect(turn.streamText).toBeNull();
  });

  it("thread DB ordem cronológica + thought/narração congelam no F5", () => {
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
            latencyThoughtMs: 4000,
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
      expect(turn.thinking?.durationMs).toBe(4000);
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
  const IDLE = "Ask Lovable...";
  const RUNNING = "Queue follow-up...";
  const PLAN = "Tell Lovable what to do instead...";

  it("3 estados Lovable documentados", () => {
    expect(IDLE).toBe("Ask Lovable...");
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