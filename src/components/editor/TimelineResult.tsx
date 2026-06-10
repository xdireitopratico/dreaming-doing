import type { ForgeTimelineItem } from "@/lib/forge-run";

type TimelineResultProps = {
  item: Extract<ForgeTimelineItem, { type: "RESULT" }>;
};

export function TimelineResult({ item }: TimelineResultProps) {
  return (
    <div
      className="forge-timeline-result py-2"
      data-testid="timeline-result"
      data-ok={item.ok}
    >
      <span
        className={`text-[length:var(--font-task-label)] uppercase tracking-wider font-mono ${
          item.ok ? "text-[var(--status-done)]" : "text-[var(--status-failed)]"
        }`}
      >
        Result
      </span>
      <p className="text-[length:var(--font-task-body)] text-[var(--text-primary)] mt-0.5">
        {item.text}
      </p>
      {item.evidence && item.evidence.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {item.evidence.map((e) => (
            <li key={e} className="font-mono text-[10px] text-[var(--text-muted)]">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}