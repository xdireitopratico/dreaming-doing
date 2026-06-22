import type { SSEEvent } from "@/lib/agent-progress";

export function isToolDoneOk(data: Record<string, unknown>): boolean {
  return data.ok !== false && data.error == null;
}

export function toolDoneName(data: Record<string, unknown>): string {
  return String(data.name ?? "tool");
}

export function isToolDoneEvent(ev: SSEEvent): boolean {
  return ev.type === "tool_done" || ev.type === "tool_result" || ev.type === "tool_end";
}