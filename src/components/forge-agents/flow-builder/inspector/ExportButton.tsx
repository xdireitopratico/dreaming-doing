interface ExportButtonProps {
  exportSession: () => string;
  disabled?: boolean;
}

export function ExportButton({ exportSession, disabled = false }: ExportButtonProps) {
  const handleExport = () => {
    const json = exportSession();
    if (!json) return;

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibe-agent-session-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled}
      className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      Export JSON
    </button>
  );
}