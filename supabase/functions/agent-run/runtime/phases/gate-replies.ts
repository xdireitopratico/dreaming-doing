// runtime/phases/gate-replies.ts — Gates de inventário e plano existente (Fase 2.2)
import {
  ANTI_LEAK_RULE,
  INVENTORY_SYSTEM,
  isProjectInventoryQuestion,
} from "../../run-context.ts";
import {
  findLatestStoredPlan,
  isShowExistingPlanRequest,
  PLAN_APPROVAL_TTL_MS,
  sanitizePlanHeadline,
} from "../../plan-mode.ts";
import type { ClassificationResult } from "../../router.ts";
import type { PlanTurnRunResult, PlanTurnEmit } from "./plan-turn.ts";
import type { AgentContext, AgentState, ChatMessage, LLMProvider, ProposedPlan } from "../../types.ts";

export function appendResumeInstruction(messages: ChatMessage[]): void {
  const last = messages[messages.length - 1];
  if (last?.role === "user") return;
  messages.push({
    role: "user",
    content:
      "[Retomar] Continue a tarefa a partir do estado atual do projeto e do histórico acima. " +
      "Não recomece do zero; use os arquivos já criados ou alterados.",
  });
}

export function resolveUserPrompt(
  messages: ChatMessage[],
  originalUserRequest: string,
): string {
  const trimmed = originalUserRequest?.trim();
  if (trimmed) return trimmed;
  const last = messages.filter((m) => m.role === "user").pop()?.content;
  return typeof last === "string" ? last.trim() : "";
}

export function buildApprovedClassification(
  complexityScore: number,
  userPrompt: string,
): ClassificationResult {
  return {
    complexity: (complexityScore || 3) as 1 | 2 | 3 | 4 | 5,
    type: "modify",
    summary: (userPrompt || "Executar plano aprovado").slice(0, 200),
    needsBuild: true,
    needsDeps: false,
  };
}

export type GateReplyDeps = {
  state: AgentState;
  context: AgentContext | null;
  originalUserRequest: string;
  planMode: boolean;
  emit: PlanTurnEmit;
  configuredModel: () => LLMProvider;
  persistFinal: (
    summary: string,
    opts?: { lastFinishOk?: boolean; conversational?: boolean },
  ) => Promise<void>;
  clearCheckpoint: () => Promise<void>;
};

export async function runInventoryGate(
  deps: GateReplyDeps,
  model: LLMProvider,
): Promise<PlanTurnRunResult> {
  deps.emit("phase", { phase: "inventory", message: "" });
  const ctx = deps.context?.projectConfig?.slice(0, 4000) ?? "(sem arquivos)";
  const manifest = deps.context?.manifest?.slice(0, 2000) ?? "";
  let inv = "";
  try {
    const resp = await model.chat({
      messages: [
        { role: "system", content: `${INVENTORY_SYSTEM}\n\n${ANTI_LEAK_RULE}` },
        { role: "user", content: `Contexto de arquivos:\n${ctx}\n\nLista:\n${manifest}` },
      ],
      max_tokens: 900,
      temperature: 0.2,
    });
    inv = (resp.content ?? "").trim();
    if (inv.length < 12) {
      const retry = await model.chat({
        messages: [
          { role: "system", content: `${INVENTORY_SYSTEM}\n\n${ANTI_LEAK_RULE}` },
          {
            role: "user",
            content:
              `Contexto de arquivos:\n${ctx}\n\nLista:\n${manifest}\n\nResuma o estado do projeto em linguagem natural.`,
          },
        ],
        max_tokens: 900,
        temperature: 0.35,
      });
      inv = (retry.content ?? "").trim();
    }
  } catch {
    inv = "";
  }

  if (!inv) {
    const message = "Não foi possível resumir o estado do projeto.";
    deps.emit("assistant_text", { text: message, final: true });
    await deps.persistFinal(message, { lastFinishOk: false });
    await deps.clearCheckpoint();
    deps.emit("finish", { ok: false });
    return {
      ok: false,
      error: message,
      steps: 0,
      toolsUsed: [],
    };
  }
  deps.emit("assistant_text", { text: inv, final: true });
  await deps.persistFinal(inv);
  await deps.clearCheckpoint();
  deps.emit("done", { summary: inv, inventory: true });
  return { ok: true, summary: inv, steps: 0, toolsUsed: [] };
}

export async function runShowExistingPlanGate(
  deps: GateReplyDeps,
  finishPlanProposal: (plan: ProposedPlan) => Promise<PlanTurnRunResult>,
): Promise<PlanTurnRunResult | null> {
  if (!isShowExistingPlanRequest(deps.originalUserRequest)) return null;
  const stored = findLatestStoredPlan(deps.state.messages);
  if (stored) {
    const reopened: ProposedPlan = {
      ...stored.plan,
      planId: crypto.randomUUID(),
      summary: sanitizePlanHeadline(
        stored.plan.mission ?? stored.plan.summary,
        "Plano proposto",
      ),
      proposedAt: new Date().toISOString(),
      ttlMs: PLAN_APPROVAL_TTL_MS,
    };
    return finishPlanProposal(reopened);
  }
  const reply =
    "Não encontrei um plano salvo para mostrar. Descreva o que você quer construir.";
  deps.emit("assistant_text", { text: reply, final: true });
  await deps.persistFinal(reply, { lastFinishOk: true, conversational: true });
  await deps.clearCheckpoint();
  deps.emit("done", { summary: reply, conversational: true });
  return { ok: true, summary: reply, steps: 0, toolsUsed: [] };
}

export { isProjectInventoryQuestion };
