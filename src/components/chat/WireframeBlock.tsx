type WireframeBlockProps = {
  text: string;
};

/** Wireframe ASCII — monospace, scroll horizontal. */
export function WireframeBlock({ text }: WireframeBlockProps) {
  const body = text.trimEnd();
  if (!body) return null;
  return (
    <pre
      className="forge-chat-wireframe my-2 overflow-x-auto rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)] p-3 font-mono text-[11px] leading-snug text-[var(--forge-text)]"
      data-testid="wireframe-block"
    >
      {body}
    </pre>
  );
}