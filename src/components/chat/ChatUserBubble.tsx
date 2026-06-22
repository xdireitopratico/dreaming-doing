import { useLayoutEffect, useRef, useState } from "react";
import type { StoredMessagePart } from "@/lib/chat-attachments";
import { formatChatTimestamp } from "@/lib/chat/format-timestamp";

const CLAMP_LINES = 4;

type ChatUserBubbleProps = {
  content: string;
  queued?: boolean;
  parts?: StoredMessagePart[];
  timestamp?: number | null;
};

export function ChatUserBubble({ content, queued = false, parts, timestamp }: ChatUserBubbleProps) {
  const timeLabel = formatChatTimestamp(timestamp);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const hasContent = content.length > 0 || (parts?.length ?? 0) > 0;

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [content, expanded]);

  if (!hasContent) return null;

  return (
    <div className={`forge-msg-user${queued ? " forge-msg-user--queued" : ""}`}>
      {timeLabel && (
        <time className="forge-msg-timestamp" dateTime={new Date(timestamp ?? 0).toISOString()}>
          {timeLabel}
        </time>
      )}
      {content && (
        <p
          ref={textRef}
          className={`forge-msg-user-text whitespace-pre-wrap${expanded ? "" : " forge-msg-user-text--clamped"}`}
          style={expanded ? undefined : { WebkitLineClamp: CLAMP_LINES }}
        >
          {content}
        </p>
      )}
      {parts?.map((p, i) => {
        if (p.type === "image") {
          return (
            <img
              key={i}
              src={`data:${p.mimeType};base64,${p.dataBase64}`}
              alt={p.name}
              className="forge-msg-user-image"
            />
          );
        }
        if (p.type === "file_blob") {
          return (
            <div key={i} className="forge-msg-user-file">
              <span className="forge-msg-user-file-name">{p.name}</span>
            </div>
          );
        }
        return null;
      })}
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