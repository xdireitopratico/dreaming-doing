import type { JobInspectorTab } from "@/hooks/useJobWorkspaceFocus";

const BASE_TABS: { id: JobInspectorTab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "changes", label: "Changes" },
];

export type InspectorNavControlsProps = {
  activeTab: JobInspectorTab;
  showPlanTab: boolean;
  onTabChange: (tab: JobInspectorTab) => void;
  onBackToLatest: () => void;
  /** Inspector embutido: título "Details" centralizado. */
  showDetailsTitle?: boolean;
};

export function InspectorNavControls({
  activeTab,
  showPlanTab,
  onTabChange,
  onBackToLatest,
  showDetailsTitle = false,
}: InspectorNavControlsProps) {
  const normalizedTab = (activeTab as string) === "details" ? "timeline" : activeTab;
  const resolvedTab =
    normalizedTab === "plan" && showPlanTab
      ? "plan"
      : normalizedTab === "changes"
        ? "changes"
        : "timeline";

  return (
    <>
      <button type="button" className="forge-inspector-back-btn" onClick={onBackToLatest}>
        Back to latest
      </button>
      {showDetailsTitle && <div className="forge-inspector-title">Details</div>}
      <div className="forge-inspector-tabs" role="tablist" aria-label="Inspector">
        {BASE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={resolvedTab === tab.id}
            className="forge-inspector-tab"
            data-active={resolvedTab === tab.id}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        {showPlanTab && (
          <button
            type="button"
            role="tab"
            aria-selected={resolvedTab === "plan"}
            className="forge-inspector-tab"
            data-active={resolvedTab === "plan"}
            onClick={() => onTabChange("plan")}
          >
            Plan
          </button>
        )}
      </div>
    </>
  );
}
