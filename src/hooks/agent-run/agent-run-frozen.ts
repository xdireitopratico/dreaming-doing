import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import { inspectorProgressWeight } from "@/lib/assistant-run-progress";

export type FrozenProgressDeps = {
  runIdRef: MutableRefObject<string | null>;
  progressRef: MutableRefObject<AgentProgress>;
  frozenRunProgressRef: MutableRefObject<Map<string, AgentProgress>>;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  setActiveRunStartedAtMs: Dispatch<SetStateAction<number | null>>;
  bumpFrozenProgressTick: () => void;
};

export function createFrozenProgressHandlers(deps: FrozenProgressDeps) {
  const freezeRunProgress = (runId: string) => {
    if (!runId) return;
    if (deps.runIdRef.current !== runId) return;
    const p = deps.progressRef.current;
    if (inspectorProgressWeight(p) === 0) return;
    deps.frozenRunProgressRef.current.set(runId, {
      ...p,
      timeline: [...(p.timeline ?? [])],
      tools: [...(p.tools ?? [])],
      diffs: [...(p.diffs ?? [])],
      deliveryFiles: [...(p.deliveryFiles ?? [])],
      buildLogLines: [...(p.buildLogLines ?? [])],
    });
    deps.bumpFrozenProgressTick();
  };

  const getFrozenRunProgress = (runId: string): AgentProgress | null => {
    return deps.frozenRunProgressRef.current.get(runId) ?? null;
  };

  const clearFrozenRunProgress = (runId: string) => {
    if (!deps.frozenRunProgressRef.current.delete(runId)) return;
    deps.bumpFrozenProgressTick();
  };

  const releaseLiveRunSlot = (runId: string) => {
    freezeRunProgress(runId);
    deps.runIdRef.current = null;
    deps.setActiveRunId(null);
    deps.setActiveRunStartedAtMs(null);
  };

  return {
    freezeRunProgress,
    getFrozenRunProgress,
    clearFrozenRunProgress,
    releaseLiveRunSlot,
  };
}