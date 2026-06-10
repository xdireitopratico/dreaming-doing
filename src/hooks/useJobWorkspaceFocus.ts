import { useCallback, useState } from "react";

export type JobInspectorTab = "timeline" | "changes" | "plan";

/** @deprecated Use JobInspectorTab */
export type JobWorkspaceTab = JobInspectorTab;

export type JobWorkspaceFocus = {
  runId: string;
  tab: JobInspectorTab;
};

export function useJobWorkspaceFocus() {
  const [focus, setFocus] = useState<JobWorkspaceFocus | null>(null);

  const openJobWorkspace = useCallback((runId: string, tab: JobInspectorTab = "timeline") => {
    setFocus({ runId, tab });
  }, []);

  const closeJobWorkspace = useCallback(() => {
    setFocus(null);
  }, []);

  const setJobTab = useCallback((tab: JobInspectorTab) => {
    setFocus((prev) => (prev ? { ...prev, tab } : prev));
  }, []);

  return {
    jobWorkspaceFocus: focus,
    openJobWorkspace,
    closeJobWorkspace,
    setJobTab,
    isJobFocused: focus !== null,
  };
}