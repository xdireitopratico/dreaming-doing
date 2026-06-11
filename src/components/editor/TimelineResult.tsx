import type { ForgeTimelineItem } from "@/lib/forge-run";

type TimelineResultProps = {
  item: Extract<ForgeTimelineItem, { type: "RESULT" }>;
};

export function TimelineResult({ item }: TimelineResultProps) {
  return (
    <div
      className={`forge-timeline-result forge-inspector-timeline-entry${item.ok ? "" : " forge-timeline-result--failed"}`}
      data-testid="timeline-result"
      data-ok={item.ok}
    >
      <span className="forge-timeline-result-label">Result</span>
      <p className="forge-timeline-result-summary">{item.text}</p>
      {item.evidence && item.evidence.length > 0 && (
        <ul className="forge-inspector-delivered-list mt-2">
          {item.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
