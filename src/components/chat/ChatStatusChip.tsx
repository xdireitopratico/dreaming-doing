type ChatStatusChipProps = {
  label: string;
};

export function ChatStatusChip({ label }: ChatStatusChipProps) {
  if (!label?.trim()) return null;
  return <span className="forge-status-chip">{label}</span>;
}
