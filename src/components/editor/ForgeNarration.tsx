type ForgeNarrationProps = {
  text: string;
};

export function ForgeNarration({ text }: ForgeNarrationProps) {
  return (
    <p className="forge-chat-narration-line" data-testid="forge-narration">
      {text}
    </p>
  );
}
