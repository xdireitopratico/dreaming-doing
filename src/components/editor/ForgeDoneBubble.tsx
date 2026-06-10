export function ForgeDoneBubble() {
  return (
    <div
      className="forge-done-bubble inline-flex items-center rounded-full border border-[var(--status-done)]/30 bg-[var(--status-done)]/10 px-3 py-1"
      data-testid="forge-done-bubble"
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--status-done)]">
        Done
      </span>
    </div>
  );
}