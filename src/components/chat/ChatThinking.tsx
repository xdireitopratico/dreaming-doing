import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type ChatThinkingProps = {
  startedAtMs: number;
  active: boolean;
  durationMs?: number;
};

export function ChatThinking({ startedAtMs, active, durationMs }: ChatThinkingProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      if (durationMs) setElapsed(Math.round(durationMs / 1000));
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAtMs) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [active, startedAtMs, durationMs]);

  return (
    <p className="forge-chat-think-line">
      💡 {active ? `Thinking... ${elapsed}s` : `Thought for ${elapsed}s`}
      {active && <Loader2 className="size-3.5 ml-1 animate-spin inline" />}
    </p>
  );
}
