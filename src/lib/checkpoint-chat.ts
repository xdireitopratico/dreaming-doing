/** Espelho testável de supabase/functions/agent-run/checkpoint-chat.ts */

import { collapseNarrationBuffer } from "@/lib/narration-dedupe";

export function checkpointChatText(narration: string, _buildFix: boolean): string {
  const n = collapseNarrationBuffer(narration).trim();
  return n || "";
}