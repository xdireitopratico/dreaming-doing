type ForgeStatusChipProps = {
  label: string;
};

/** Pill cinza de status — Lovable img 4 (ativo) e img 15 (persistido). */
export function ForgeStatusChip({ label }: ForgeStatusChipProps) {
  return (
    <div className="forge-status-chip" data-testid="forge-status-chip" title={label}>
      <span className="forge-status-chip-label">{label}</span>
    </div>
  );
}
