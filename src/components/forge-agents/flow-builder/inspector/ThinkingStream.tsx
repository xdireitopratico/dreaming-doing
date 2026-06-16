interface ThinkingStreamProps {
  thinking: string;
}

export function ThinkingStream({ thinking }: ThinkingStreamProps) {
  if (!thinking.trim()) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        Aguardando thinking do LLM...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <pre className="whitespace-pre-wrap text-xs leading-relaxed">{thinking}</pre>
    </div>
  );
}