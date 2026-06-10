type ForgeNarrationProps = {
  text: string;
};

export function ForgeNarration({ text }: ForgeNarrationProps) {
  return (
    <p
      className="forge-narration text-[var(--text-secondary)] italic text-sm leading-relaxed whitespace-pre-wrap"
      data-testid="forge-narration"
    >
      {text}
    </p>
  );
}