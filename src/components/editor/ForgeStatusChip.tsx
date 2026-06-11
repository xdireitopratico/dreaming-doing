type ForgeStatusChipProps = {
  label: string;
};

export function ForgeStatusChip({ label }: ForgeStatusChipProps) {
  return (
    <div className="forge-status-chip" data-testid="forge-status-chip">
      {label}
    </div>
  );
}
