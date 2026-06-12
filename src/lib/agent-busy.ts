import { toast as sonnerToast } from "sonner";
import { toast } from "@/lib/toast";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";

export type AgentBusyInput = {
  running: boolean;
  activeRunId: string | null;
  finished: boolean;
  canceled: boolean;
  awaiting: boolean;
  connectInFlight: boolean;
};

export type AgentBusyReason = "zombie" | "running" | "other_conversation";

export type AgentBusyInfo = {
  activeRunId: string | null;
  reason: AgentBusyReason;
  pendingCount?: number;
  message?: string;
};

/** Turno otimista (`__pending__`) não conta como run ativo — senão runAgent nunca conecta após send. */
export function isEditorAgentBusy(input: AgentBusyInput): boolean {
  const liveRun =
    input.activeRunId != null &&
    input.activeRunId !== PENDING_RUN_ID &&
    !input.finished &&
    !input.canceled &&
    !input.awaiting;

  const pendingTurn = input.activeRunId === PENDING_RUN_ID;
  return (input.running && !pendingTurn) || liveRun || input.connectInFlight;
}

export function parseAgentBusyResponse(body: Record<string, unknown>): AgentBusyInfo | null {
  if (body.busy !== true) return null;
  const reasonRaw = body.reason;
  const reason: AgentBusyReason =
    reasonRaw === "zombie" || reasonRaw === "other_conversation" ? reasonRaw : "running";
  return {
    activeRunId: typeof body.activeRunId === "string" ? body.activeRunId : null,
    reason,
    pendingCount: typeof body.pendingCount === "number" ? body.pendingCount : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
  };
}

export function formatAgentBusyMessage(info: AgentBusyInfo): string {
  const shortId = info.activeRunId?.slice(0, 8) ?? "???";
  if (info.reason === "zombie") {
    return `Agente travado (run ${shortId}…) — cancele e envie de novo.`;
  }
  if (info.reason === "other_conversation") {
    return `Agente ocupado em outra conversa (run ${shortId}…).`;
  }
  return `Agente ocupado (run ${shortId}…) — aguarde ou cancele a execução.`;
}

export function showAgentBusyToast(
  info: AgentBusyInfo,
  onCancel?: (runId: string) => void | Promise<void>,
): void {
  const message = info.message?.trim() || formatAgentBusyMessage(info);
  if (info.activeRunId && onCancel) {
    sonnerToast.error(message, {
      duration: 12_000,
      action: {
        label: "Cancelar run",
        onClick: () => {
          void onCancel(info.activeRunId!);
        },
      },
    });
    return;
  }
  toast.error(message);
}