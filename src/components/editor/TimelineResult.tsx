import type { ForgeTimelineItem } from "@/lib/forge-run";

type TimelineResultProps = {
  item: Extract<ForgeTimelineItem, { type: "RESULT" }>;
};

export function TimelineResult({ item }: TimelineResultProps) {
  return (
    <div
      className={`lovable-result-bubble forge-inspector-timeline-entry${item.ok ? "" : " lovable-result-bubble--failed"}`}
      data-testid="timeline-result"
      data-ok={item.ok}
    >
      <span className="lovable-result-bubble-label">Result</span>
      <p className="lovable-result-bubble-summary">{item.text}</p>
      {item.evidence && item.evidence.length > 0 && (
        <ul className="lovable-job-delivered-list mt-2">
          {item.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}