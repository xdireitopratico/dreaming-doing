/**
 * Fixture visual Lovable — dados copiados dos prints image (4)(5)(8)(9)(14)(15).
 * Rota dev-only para provar paridade no browser: /dev/lovable-chat
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { ChatMessage } from "@/lib/chat-types";
import type { ThreadItem } from "@/lib/chat/types";
import { ChatThread } from "@/components/chat/ChatThread";
import { ChatComposer } from "@/components/chat/ChatComposer";

export const Route = createFileRoute("/dev/lovable-chat")({
  component: LovableChatFixturePage,
  ssr: false,
});

const FIXTURES: { id: string; label: string; ref: string; items: ThreadItem[]; running: boolean; planPending: boolean }[] = [
  {
    id: "img4",
    label: "Working — narração + mini-card",
    ref: "image (4)/(5)",
    running: true,
    planPending: false,
    items: [
      {
        kind: "user",
        message: {
          id: "u4",
          role: "user",
          content:
            "isso, ééé, qualquer coisa que esteja lá queee, que não seja desse escopo, ok, ééé, pode ser higienizado, né? Então pode remover o que não for do escopo atual, limpar componentes mortos e deixar só o que o chat Lovable precisa.",
          timestamp: 0,
        },
      },
      {
        kind: "assistant",
        runId: "run-img4",
        isActive: true,
        streamText: null,
        thinking: { active: false, durationMs: 4000 },
        narration: "Vou investigar o estado atual do container DP Lara antes de organizar a higienização.",
        statusChips: [],
        miniCard: {
          title: "Orchestrating Lara container cleanup",
          header: "Working",
          subtitle: "Orchestrating Lara container cleanup",
          liveBriefings: ["Orchestrating Lara container cleanup"],
          status: "working",
          tasks: [
            { id: "t1", label: "Higienizar Dockerfile.lara", status: "active" },
            { id: "t2", label: "Conectar rota browser execute", status: "pending" },
          ],
          currentTaskIndex: 0,
        },
        finished: false,
      },
    ],
  },
  {
    id: "img5",
    label: "Estado C — Edited Dockerfile.lara",
    ref: "image (5)",
    running: true,
    planPending: false,
    items: [
      {
        kind: "assistant",
        runId: "run-img5",
        isActive: true,
        streamText: null,
        thinking: { active: false, durationMs: 4000 },
        narration: "Vou investigar o estado atual do container DP Lara antes de organizar a higienização.",
        miniCard: {
          title: "Orchestrating Lara container cleanup",
          header: "Edited Dockerfile.lara",
          subtitle: "Orchestrating Lara container cleanup",
          liveBriefings: ["Orchestrating Lara container cleanup"],
          status: "working",
          tasks: [
            { id: "t1", label: "Higienizar Dockerfile.lara", status: "pending" },
            { id: "t2", label: "Conectar rota browser execute", status: "pending" },
            { id: "t3", label: "Proteção anti-destrutivo", status: "pending" },
            { id: "t4", label: "Auto-save de scripts persistente", status: "pending" },
            { id: "t5", label: "Regenerar bundles e redeploy", status: "pending" },
          ],
          currentTaskIndex: 0,
          editedFile: "Dockerfile.lara",
        },
        finished: false,
      },
    ],
  },
  {
    id: "img8",
    label: "Estado C — Edited index.ts",
    ref: "image (8)",
    running: true,
    planPending: false,
    items: [
      {
        kind: "assistant",
        runId: "run-img8",
        isActive: true,
        streamText: null,
        thinking: { active: false, durationMs: 4000 },
        narration: "Vou investigar o estado atual do container DP Lara antes de organizar a higienização.",
        miniCard: {
          title: "Configuring Lara workspace safeguards now",
          header: "Edited index.ts",
          subtitle: "Configuring Lara workspace safeguards now",
          liveBriefings: ["Configuring Lara workspace safeguards now"],
          status: "working",
          tasks: [
            { id: "t1", label: "Higienizar Dockerfile.lara", status: "pending" },
            { id: "t2", label: "Conectar rota browser execute", status: "pending" },
            { id: "t3", label: "Proteção anti-destrutivo", status: "pending" },
            { id: "t4", label: "Auto-save de scripts persistente", status: "pending" },
            { id: "t5", label: "Regenerar bundles e redeploy", status: "pending" },
          ],
          currentTaskIndex: 0,
          editedFile: "index.ts",
        },
        finished: false,
      },
    ],
  },
  {
    id: "img9",
    label: "Estado C — Running command",
    ref: "image (9)",
    running: true,
    planPending: false,
    items: [
      {
        kind: "assistant",
        runId: "run-img9",
        isActive: true,
        streamText: null,
        thinking: { active: false, durationMs: 4000 },
        narration: "Vou investigar o estado atual do container DP Lara antes de organizar a higienização.",
        miniCard: {
          title: "Configuring Lara workspace safeguards now",
          header: "Running command",
          subtitle: "Configuring Lara workspace safeguards now",
          liveBriefings: ["Configuring Lara workspace safeguards now"],
          status: "working",
          tasks: [
            { id: "t1", label: "Higienizar Dockerfile.lara", status: "pending" },
            { id: "t2", label: "Conectar rota browser execute", status: "pending" },
            { id: "t3", label: "Proteção anti-destrutivo", status: "pending" },
            { id: "t4", label: "Auto-save de scripts persistente", status: "pending" },
            { id: "t5", label: "Regenerar bundles e redeploy", status: "active" },
          ],
          currentTaskIndex: 4,
        },
        finished: false,
      },
    ],
  },
  {
    id: "img14",
    label: "Estado D — Plan ready teaser",
    ref: "image (14) chat",
    running: false,
    planPending: true,
    items: [
      {
        kind: "assistant",
        runId: "run-img14",
        isActive: false,
        streamText: null,
        thinking: { active: false, durationMs: 5000 },
        narration: "Vou propor um plano para desbloquear a exclusão do documento travado.",
        planTeaser: true,
        miniCard: {
          title: "Defining cross-view deletion strategy planning",
          header: "Plan ready",
          subtitle: "Defining cross-view deletion strategy planning",
          liveBriefings: ["Defining cross-view deletion strategy planning"],
          status: "working",
          planReady: true,
          hasPlan: true,
          tasks: [
            { id: "s1", label: "Desbloquear exclusão documento", status: "pending" },
            { id: "s2", label: "Botão Excluir na aba Documentos", status: "pending" },
            { id: "s3", label: "Validar vínculo proposta/banco", status: "pending" },
          ],
          currentTaskIndex: 0,
        },
        finished: false,
      },
    ],
  },
  {
    id: "img15",
    label: "Terminal — plano no mini-card",
    ref: "image (15)",
    running: false,
    planPending: true,
    items: [
      {
        kind: "user",
        message: {
          id: "u15",
          role: "user",
          content:
            "agora foi mal. O único lugar que cê consegue excluir ele é no fluxos. E agora esse aqui nem exclui, não exclui. Proposta de honorários Renato Alves, essa eu não consigo nem excluir, não sei nem daq. Po...",
          timestamp: 0,
        },
      },
      {
        kind: "assistant",
        runId: "run-img15",
        isActive: false,
        streamText: null,
        narration: "Vou propor um plano para desbloquear a exclusão do documento travado.",
        statusChips: [],
        planTeaser: true,
        miniCard: {
          title: "Defining cross-view deletion strategy planning",
          header: "Plan ready",
          subtitle: "Defining cross-view deletion strategy planning",
          liveBriefings: ["Defining cross-view deletion strategy planning"],
          status: "working",
          planReady: true,
          hasPlan: true,
          tasks: [
            { id: "s1", label: "Desbloquear exclusão do documento", status: "pending" },
          ],
          currentTaskIndex: 0,
        },
        finished: true,
        lastFinishOk: true,
      },
    ],
  },
];

function LovableChatFixturePage() {
  const [activeId, setActiveId] = useState(FIXTURES[0]!.id);
  const fixture = FIXTURES.find((f) => f.id === activeId) ?? FIXTURES[0]!;

  return (
    <div className="min-h-screen bg-[var(--bg-chat)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-forge)] px-4 py-3 flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-[var(--text-muted)]">Lovable fixture</span>
        {FIXTURES.map((f) => (
          <button
            key={f.id}
            type="button"
            data-fixture={f.id}
            className={`rounded-md px-2 py-1 text-xs border ${
              f.id === activeId
                ? "border-[var(--text-accent)] text-[var(--text-primary)]"
                : "border-[var(--border-forge)] text-[var(--text-muted)]"
            }`}
            onClick={() => setActiveId(f.id)}
          >
            {f.ref}
          </button>
        ))}
      </header>

      <div className="mx-auto max-w-[420px] h-[calc(100vh-52px)] flex flex-col border-x border-[var(--border-forge)]">
        <p className="px-3 py-2 text-[10px] font-mono text-[var(--text-muted)] border-b border-[var(--border-forge)]">
          {fixture.label}
        </p>
        <div className="forge-chat-inner flex-1 min-h-0 flex flex-col">
          <div className="forge-messages flex-1 overflow-y-auto px-3 py-4" data-testid="lovable-fixture-stream">
            <ChatThread items={fixture.items} />
          </div>
          <ChatComposer
            running={fixture.running}
            planPending={fixture.planPending}
            onSend={() => {}}
            onStop={() => {}}
            onVisualEdits={() => {}}
          />
        </div>
      </div>
    </div>
  );
}