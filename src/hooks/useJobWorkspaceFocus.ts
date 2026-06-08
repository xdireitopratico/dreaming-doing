import { useCallback, useState } from "react";

export type JobWorkspaceTab = "details" | "timeline" | "changes";

export type JobWorkspaceFocus = {
  runId: string;
  tab: JobWorkspaceTab;
};

export function useJobWorkspaceFocus() {
  const [focus, setFocus] = useState<JobWorkspaceFocus | null>(null);

  const openJobWorkspace = useCallback((runId: string, tab: JobWorkspaceTab = "timeline") => {
    setFocus({ runId, tab });
  }, []);

  const closeJobWorkspace = useCallback(() => {
    setFocus(null);
  }, []);

  const setJobTab = useCallback((tab: JobWorkspaceTab) => {
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