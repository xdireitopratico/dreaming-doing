import { useCallback, useRef, useState } from "react";

export type JobInspectorTab = "details" | "timeline" | "changes" | "plan";

/** @deprecated Use JobInspectorTab */
export type JobWorkspaceTab = JobInspectorTab;

export type JobWorkspaceFocus = {
  runId: string;
  tab: JobInspectorTab;
};

export function useJobWorkspaceFocus() {
  const [focus, setFocus] = useState<JobWorkspaceFocus | null>(null);
  const dismissedRunIdRef = useRef<string | null>(null);

  const openJobWorkspace = useCallback((runId: string, tab: JobInspectorTab = "details") => {
    setFocus({ runId, tab });
    if (dismissedRunIdRef.current !== runId) {
      dismissedRunIdRef.current = null;
    }
  }, []);

  const closeJobWorkspace = useCallback(() => {
    setFocus((prev) => {
      if (prev?.runId) dismissedRunIdRef.current = prev.runId;
      return null;
    });
  }, []);

  const setJobTab = useCallback((tab: JobInspectorTab) => {
    setFocus((prev) => (prev ? { ...prev, tab } : prev));
  }, []);

  const isInspectorDismissedForRun = useCallback((runId: string) => {
    return dismissedRunIdRef.current === runId;
  }, []);

  const clearInspectorDismissed = useCallback(() => {
    dismissedRunIdRef.current = null;
  }, []);

  return {
    jobWorkspaceFocus: focus,
    openJobWorkspace,
    closeJobWorkspace,
    setJobTab,
    isJobFocused: focus !== null,
    isInspectorDismissedForRun,
    clearInspectorDismissed,
  };
}
