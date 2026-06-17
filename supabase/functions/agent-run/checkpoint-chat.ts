import { collapseNarrationBuffer } from "./narration-dedupe.ts";

export function checkpointChatText(narration: string, _buildFix: boolean): string {
  const n = collapseNarrationBuffer(narration).trim();
  return n || "";
}