import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
import { loadAgentPreferencesForAgentRun } from "@/lib/agent-preferences";
import { loadAgentSessionExtensions } from "@/lib/agent-session-extensions";
import { formatAgentFetchError } from "@/lib/agent-fetch-errors";
import { releaseAgentConnect, tryAcquireAgentConnect } from "@/lib/agent-session-guards";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import type { AgentBusyInfo } from "@/lib/agent-busy";
import { parseAgentBusyResponse } from "@/lib/agent-busy";
import {
  type AgentConnectOptions,
  type AgentProgress,
  initialAgentProgress,
} from "@/lib/agent-progress";
import { dispatchTasteUiAction, isTasteUiAction } from "@/lib/taste-ui-actions";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";
import { parseErrorResponse, postAgentRun } from "@/hooks/agent-run/agent-run-connect";
import type { AgentStreamRow } from "@/hooks/agent-run/agent-run-stream";

export type AgentConnectResult = { ok: true } | { ok: false; error: string; busy?: AgentBusyInfo };

export type LifecycleHandlersDeps = {
  runIdRef: MutableRefObject<string | null>;
  closedRunIdRef: MutableRefObject<string | null>;
  activeRunStartedAtMs: number | null;
  setProgress: Dispatch<SetStateAction<AgentProgress>>;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  setActiveRunStartedAtMs: Dispatch<SetStateAction<number | null>>;
  setQueueBlockingReason: Dispatch<SetStateAction<string | null>>;
  teardownChannels: () => void;
  subscribeToRun: (runId: string, opts?: { resetProgress?: boolean }) => Promise<void>;
  enqueueStreamRow: (row: AgentStreamRow) => boolean;
};

type SseFrame = {
  event: string | null;
  data: string;
};

async function consumeSseResponse(
  res: Response,
  onFrame: (frame: SseFrame) => Promise<void> | void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Stream indisponível na resposta do agente");

  const decoder = new TextDecoder();
  let buffer = "";

  const flushBlock = async (block: string) => {
    const lines = block.replace(/\r/g, "").split("\n");
    let event: string | null = null;
    const dataLines: string[] = [];
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("event:")) {
        event = line.slice(6).trim() || null;
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length === 0) return;
    await onFrame({ event, data: dataLines.join("\n") });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n\n");
    while (idx >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      await flushBlock(block);
      idx = buffer.indexOf("\n\n");
    }
  }

  const tail = buffer.trim();
  if (tail) await flushBlock(tail);
}

export function createLifecycleHandlers(deps: LifecycleHandlersDeps) {
  const clearPendingTurn = () => {
    deps.setActiveRunStartedAtMs(null);
    deps.setActiveRunId((cur) => (cur === PENDING_RUN_ID ? null : cur));
    deps.setProgress((p) =>
      p.finished ? p : { ...p, finished: true, statusHint: null, phase: null },
    );
  };

  const connect = async (
    projectId: string,
    conversationId: string,
    sessionKind?: ForgeSessionKind,
    options?: AgentConnectOptions & { tasteAction?: TasteAction },
  ): Promise<AgentConnectResult> => {
    if (!tryAcquireAgentConnect()) {
      logEditorTelemetryEvent("agent_run", "connect_skipped_inflight", "warn");
      deps.setProgress((p) => ({
        ...p,
        statusHint: "Aguarde — conexão do agente em andamento…",
      }));
      return {
        ok: false,
        error: "Aguarde — conexão do agente em andamento…",
      };
    }
    const manualResume = options?.resume === true;
    const directChatMode = options?.mode === "chat";
    deps.teardownChannels();
    deps.setQueueBlockingReason(null);
    const keepPending = deps.activeRunStartedAtMs != null;
    if (keepPending) {
      deps.setProgress((p) => ({
        ...p,
        statusHint: directChatMode ? "Respondendo…" : "Conectando ao agente…",
        finished: false,
        resumable: false,
        phase: p.phase ?? null,
      }));
    } else if (directChatMode) {
      deps.setProgress({
        ...initialAgentProgress,
        statusHint: "Respondendo…",
        finished: false,
        conversational: true,
      });
    } else {
      deps.setProgress({
        ...initialAgentProgress,
        statusHint: "Iniciando agente…",
        resumable: false,
        phase: null,
      });
    }

    logEditorTelemetryEvent("agent_run", "connect_start", "info", sessionKind ?? "auto");

    try {
      const preferences = await loadAgentPreferencesForAgentRun();
      const res = await postAgentRun({
        projectId,
        conversationId,
        preferences,
        sessionKind,
        ...(sessionKind === "taste" && options?.tasteAction
          ? { tasteAction: options.tasteAction }
          : {}),
        resume: manualResume,
        autoResume: false,
        mode: options?.mode ?? "chat",
        ...loadAgentSessionExtensions(),
      }, { stream: true });

      if (!res.ok) {
        const msg = await parseErrorResponse(res);
        clearPendingTurn();
        deps.setActiveRunStartedAtMs(null);
        deps.setActiveRunId((cur) => (cur === PENDING_RUN_ID ? null : cur));
        deps.setProgress((p) => ({ ...p, error: msg, finished: true }));
        releaseAgentConnect();
        return { ok: false, error: msg };
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        let currentRunId: string | null = null;
        let terminalSeen = false;
        try {
          await consumeSseResponse(res, async (frame) => {
            if (!frame.event) return;
            const payload = frame.data ? (JSON.parse(frame.data) as Record<string, unknown>) : {};
            if (frame.event === "run") {
              const runId = typeof payload.runId === "string" ? payload.runId : null;
              if (runId) {
                currentRunId = runId;
                deps.runIdRef.current = runId;
                deps.setActiveRunId(runId);
                deps.setActiveRunStartedAtMs(Date.now());
                deps.setProgress((p) => ({ ...p, statusHint: "Conectando ao agente…" }));
              }
              return;
            }
            if (frame.event === "stream") {
              const row = payload as AgentStreamRow;
              if (!row || typeof row.seq !== "number") return;
              terminalSeen = deps.enqueueStreamRow({
                ...row,
                source: "live",
              });
              return;
            }
            if (frame.event === "error") {
              const msg =
                typeof payload.message === "string"
                  ? payload.message
                  : "Falha ao acompanhar o stream do agente";
              clearPendingTurn();
              deps.teardownChannels();
              deps.setProgress((p) => ({ ...p, error: msg, finished: true }));
              throw new Error(msg);
            }
          });
        } catch (err) {
          const msg = formatAgentFetchError(err);
          clearPendingTurn();
          deps.teardownChannels();
          deps.setProgress((p) => ({ ...p, error: msg, finished: true }));
          return { ok: false, error: msg };
        } finally {
          if (currentRunId && terminalSeen) {
            deps.setActiveRunStartedAtMs(null);
          }
        }

        if (!terminalSeen && currentRunId) {
          await deps.subscribeToRun(currentRunId, { resetProgress: false });
        }

        return { ok: true };
      }

      const body = (await res.json()) as Record<string, unknown>;

      const busyInfo = parseAgentBusyResponse(body);
      if (busyInfo) {
        const msg = busyInfo.message ?? "Agente ocupado.";
        clearPendingTurn();
        deps.setProgress((p) => ({
          ...p,
          finished: true,
          pendingQueueCount:
            typeof body.pendingCount === "number" ? body.pendingCount : p.pendingQueueCount,
          statusHint: msg,
          error: null,
        }));
        releaseAgentConnect();
        return { ok: false, error: msg, busy: busyInfo };
      }

      if (body.queued) {
        clearPendingTurn();
        deps.setProgress((p) => ({
          ...p,
          finished: true,
          pendingQueueCount: typeof body.pendingCount === "number" ? body.pendingCount : 0,
          statusHint:
            typeof body.message === "string" ? body.message : "Mensagem na fila do agente.",
          error: null,
        }));
        releaseAgentConnect();
        return { ok: true };
      }

      if (body.ok && body.content && !body.runId && body.chat !== true) {
        const uiActions = Array.isArray(body.uiActions) ? body.uiActions : [];
        for (const action of uiActions) {
          if (action && typeof action === "object" && isTasteUiAction(action)) {
            dispatchTasteUiAction(action);
          }
        }
        clearPendingTurn();
        deps.runIdRef.current = null;
        deps.setActiveRunId(null);
        deps.setActiveRunStartedAtMs(null);
        deps.setProgress((p) => ({
          ...p,
          finished: true,
          lastFinishOk: true,
          conversational: true,
          streamText: typeof body.content === "string" ? body.content : null,
          statusHint: body.chat ? "Resposta enviada." : "Resposta Taste enviada.",
        }));
        releaseAgentConnect();
        return { ok: true };
      }

      const runId = typeof body.runId === "string" ? body.runId : null;
      if (!runId) {
        const msg = "Resposta inválida do servidor";
        clearPendingTurn();
        deps.setProgress((p) => ({
          ...p,
          error: msg,
          finished: true,
        }));
        releaseAgentConnect();
        return { ok: false, error: msg };
      }

      await deps.subscribeToRun(runId);
      logEditorTelemetryEvent("agent_run", "connect_ok", "info", runId.slice(0, 8));
      return { ok: true };
    } catch (e) {
      const msg = formatAgentFetchError(e);
      clearPendingTurn();
      deps.teardownChannels();
      deps.setProgress((p) => ({
        ...p,
        error: msg,
        finished: true,
      }));
      return { ok: false, error: msg };
    } finally {
      releaseAgentConnect();
    }
  };

  const beginPendingTurn = () => {
    const startedAtMs = Date.now();
    deps.setActiveRunStartedAtMs(startedAtMs);
    deps.setActiveRunId(PENDING_RUN_ID);
    deps.setProgress({
      ...initialAgentProgress,
      statusHint: "Iniciando…",
      phase: null,
      finished: false,
    });
    deps.closedRunIdRef.current = null;
    return startedAtMs;
  };

  const watch = async (projectId: string, conversationId: string, runId: string) => {
    void projectId;
    void conversationId;
    const isNew = deps.runIdRef.current !== runId;
    if (isNew) {
      deps.closedRunIdRef.current = null;
      deps.setActiveRunId(runId);
      deps.setActiveRunStartedAtMs(Date.now());
      deps.setProgress({
        ...initialAgentProgress,
        statusHint: "Conectando ao agente…",
      });
    }
    await deps.subscribeToRun(runId, { resetProgress: isNew });
  };

  return { connect, watch, beginPendingTurn, clearPendingTurn };
}
