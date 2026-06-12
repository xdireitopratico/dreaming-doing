import { useLayoutEffect, useRef, useState } from "react";

const CLAMP_LINES = 4;

type ChatUserBubbleProps = {
  content: string;
  queued?: boolean;
};

export function ChatUserBubble({ content, queued = false }: ChatUserBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [content, expanded]);

  return (
    <div className={`forge-msg-user${queued ? " forge-msg-user--queued" : ""}`}>
      <p
        ref={textRef}
        className={`forge-msg-user-text whitespace-pre-wrap${expanded ? "" : " forge-msg-user-text--clamped"}`}
        style={expanded ? undefined : { WebkitLineClamp: CLAMP_LINES }}
      >
        {content}
      </p>
      {overflows && !expanded && (
        <button
          type="button"
          className="forge-msg-user-show-more"
          onClick={() => setExpanded(true)}
        >
          Show more
        </button>
      )}
      {queued && <span className="forge-msg-queued-label">Na fila…</span>}
    </div>
  );
}