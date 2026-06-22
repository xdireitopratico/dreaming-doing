import type { SSEEvent } from "@/lib/agent-progress";
import { describeStepExpectation } from "@/lib/step-intent";

export interface StepFileRef {
  path: string;
  langLabel: string;
  fileName: string;
}

function fileBase(path: string): string {
  const p = path.replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

/** Reidrata timeline mínima a partir de executionLog persistido no DB. */
export function timelineFromExecutionLog(lines: string[]): SSEEvent[] {
  const out: SSEEvent[] = [];
  let t = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    t += 1000;
    if (/^read\b/i.test(trimmed) || /lendo/i.test(trimmed)) {
      out.push({
        type: "tool_start",
        timestamp: t,
        data: {
          name: "fs_read",
          args: { path: trimmed.replace(/^read\s+/i, "") },
          step_intent: describeStepExpectation("fs_read", {
            path: trimmed.replace(/^read\s+/i, ""),
          }),
        },
      });
      out.push({ type: "tool_done", timestamp: t + 1, data: { name: "fs_read", ok: true } });
    } else if (/^edit/i.test(trimmed) || /editou|edited/i.test(trimmed)) {
      out.push({
        type: "tool_start",
        timestamp: t,
        data: { name: "fs_edit", args: { path: trimmed } },
      });
      out.push({ type: "tool_done", timestamp: t + 1, data: { name: "fs_edit", ok: true } });
    } else {
      out.push({
        type: "assistant_text",
        timestamp: t,
        data: { text: trimmed, delta: true, thinking: true },
      });
    }
  }
  return out;
}

