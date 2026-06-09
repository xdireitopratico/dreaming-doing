import { ArrowLeft } from "lucide-react";
import type { JobWorkspaceTab } from "@/hooks/useJobWorkspaceFocus";

type JobWorkspaceHeaderProps = {
  activeTab: JobWorkspaceTab;
  onTabChange: (tab: JobWorkspaceTab) => void;
  onBackToLatest: () => void;
};

const TABS: { id: JobWorkspaceTab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "changes", label: "Changes" },
];

export function JobWorkspaceHeader({
  activeTab,
  onTabChange,
  onBackToLatest,
}: JobWorkspaceHeaderProps) {
  return (
    <div className="lovable-job-workspace-header" data-testid="job-workspace-header">
      <button
        type="button"
        className="lovable-job-back-btn"
        onClick={onBackToLatest}
      >
        <ArrowLeft className="size-3.5" />
        Back to latest
      </button>

      <div className="lovable-job-tabs" role="tablist" aria-label="Job inspector">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className="lovable-job-tab"
            data-active={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}