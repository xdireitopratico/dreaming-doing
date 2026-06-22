import type { Dispatch, SetStateAction } from "react";
import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
import { loadAgentPreferencesForAgentRun } from "@/lib/agent-preferences";
import { loadAgentSessionExtensions } from "@/lib/agent-session-extensions";
import type { AgentProgress } from "@/lib/agent-progress";
import type { PendingQueueItem } from "@/components/chat/ChatQueueDock";
import type { StoredMessagePart } from "@/lib/chat-attachments";
import {
  formatQueueBlockReason,
  parseErrorResponse,
  postAgentRun,
} from "@/hooks/agent-run/agent-run-connect";

export type QueueHandlersDeps = {
  setProgress: Dispatch<SetStateAction<AgentProgress>>;
  setPendingQueueItems: Dispatch<SetStateAction<PendingQueueItem[]>>;
  setQueueBlockingReason: Dispatch<SetStateAction<string | null>>;
  setQueuePaused: Dispatch<SetStateAction<boolean>>;
  subscribeToRun: (runId: string, opts?: { resetProgress?: boolean }) => Promise<void>;
};

function mapQueueItems(raw: unknown[]): PendingQueueItem[] {
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      createdAt: String(r.createdAt ?? r.created_at ?? ""),
      preview: String(r.preview ?? ""),
      repeat: typeof r.repeat === "number" ? r.repeat : 1,
      paused: r.paused === true,
    };
  });
}

export function createQueueHandlers(deps: QueueHandlersDeps) {
  const refreshPendingQueue = async (projectId: string, conversationId: string) => {
    try {
      const res = await postAgentRun({
        action: "list_pending",
        projectId,
        conversationId,
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        pendingCount?: number;
        items?: unknown[];
        queuePaused?: boolean;
      };
      if (typeof body.pendingCount === "number") {
        deps.setProgress((p) => ({ ...p, pendingQueueCount: body.pendingCount! }));
      }
      deps.setPendingQueueItems(mapQueueItems(body.items ?? []));
      if (typeof body.queuePaused === "boolean") {
        deps.setQueuePaused(body.queuePaused);
      }
      if ((body.pendingCount ?? 0) === 0) {
        deps.setQueueBlockingReason(null);
      }
    } catch {
      // best-effort — contador atualiza no próximo mount/finish
    }
  };

  const clearPendingItem = async (
    projectId: string,
    conversationId: string,
    messageId: string,
  ) => {
    const res = await postAgentRun({
      action: "clear_pending",
      projectId,
      conversationId,
      messageId,
    });
    if (!res.ok) return;
    await refreshPendingQueue(projectId, conversationId);
  };

  const clearAllPending = async (projectId: string, conversationId: string) => {
    const res = await postAgentRun({
      action: "clear_pending",
      projectId,
      conversationId,
    });
    if (!res.ok) return;
    deps.setQueueBlockingReason(null);
    await refreshPendingQueue(projectId, conversationId);
  };

  const updatePendingItem = async (
    projectId: string,
    conversationId: string,
    messageId: string,
    patch: { repeat?: number; paused?: boolean },
  ) => {
    const res = await postAgentRun({
      action: "update_pending",
      projectId,
      conversationId,
      messageId,
      ...patch,
    });
    if (!res.ok) return;
    await refreshPendingQueue(projectId, conversationId);
  };

  const setQueuePaused = async (
    projectId: string,
    conversationId: string,
    paused: boolean,
  ) => {
    const res = await postAgentRun({
      action: "set_queue_paused",
      projectId,
      conversationId,
      paused,
    });
    if (!res.ok) return;
    const body = (await res.json()) as { queuePaused?: boolean };
    deps.setQueuePaused(body.queuePaused === true);
    await refreshPendingQueue(projectId, conversationId);
  };

  const drainQueue = async (
    projectId: string,
    conversationId: string,
    mode?: "plan" | "build" | "chat",
  ): Promise<{ ok: boolean; runId?: string; pendingCount?: number; reason?: string }> => {
    try {
      const payload: Record<string, unknown> = {
        action: "drain_queue",
        projectId,
        conversationId,
      };
      if (mode != null) payload.mode = mode;
      const res = await postAgentRun(payload);
      if (!res.ok) {
        const msg = await parseErrorResponse(res);
        return { ok: false, reason: msg };
      }
      const body = (await res.json()) as {
        ok?: boolean;
        runId?: string;
        continued?: boolean;
        pendingCount?: number;
        reason?: string;
      };
      if (typeof body.pendingCount === "number") {
        deps.setProgress((p) => ({ ...p, pendingQueueCount: body.pendingCount! }));
      }
      deps.setQueueBlockingReason(formatQueueBlockReason(body.reason));
      if (body.runId) {
        deps.setQueueBlockingReason(null);
        await deps.subscribeToRun(body.runId);
        return {
          ok: true,
          runId: body.runId,
          pendingCount: body.pendingCount,
        };
      }
      return {
        ok: body.continued === true,
        pendingCount: body.pendingCount,
        reason: body.reason,
      };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  };

  const queueMessage = async (
    projectId: string,
    conversationId: string,
    sessionKind?: ForgeSessionKind,
    tasteAction?: TasteAction,
    mode?: "plan" | "build" | "chat",
    payload?: { text: string; parts: StoredMessagePart[]; repeat?: number },
  ): Promise<{ ok: boolean; pendingCount?: number; message?: string }> => {
    try {
      const preferences = await loadAgentPreferencesForAgentRun();
      const res = await postAgentRun({
        projectId,
        conversationId,
        preferences,
        sessionKind,
        enqueue: true,
        mode: mode ?? "build",
        text: payload?.text,
        parts: payload?.parts,
        repeat: payload?.repeat ?? 1,
        ...(sessionKind === "taste" && tasteAction ? { tasteAction } : {}),
        ...loadAgentSessionExtensions(),
      });

      if (!res.ok) {
        const msg = await parseErrorResponse(res);
        return { ok: false, message: msg };
      }

      const body = (await res.json()) as {
        queued?: boolean;
        pendingCount?: number;
        message?: string;
        runId?: string;
        busy?: boolean;
      };
      if (body.queued) {
        deps.setProgress((p) => ({
          ...p,
          pendingQueueCount: body.pendingCount ?? 0,
          statusHint: body.message ?? "Mensagem na fila do agente.",
        }));
        void refreshPendingQueue(projectId, conversationId);
        return {
          ok: true,
          pendingCount: body.pendingCount,
          message: body.message,
        };
      }
      if (body.busy) {
        return {
          ok: false,
          message: body.message ?? "Agente ocupado — envie com enqueue ativo.",
        };
      }
      return {
        ok: false,
        message: body.message ?? "Não foi possível enfileirar a mensagem.",
      };
    } catch (e) {
      return { ok: false, message: String(e) };
    }
  };

  return {
    refreshPendingQueue,
    syncPendingCount: refreshPendingQueue,
    clearPendingItem,
    clearAllPending,
    updatePendingItem,
    setQueuePaused,
    drainQueue,
    queueMessage,
  };
}