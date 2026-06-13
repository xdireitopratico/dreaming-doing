/** Espelho testável de supabase/functions/agent-run/checkpoint-chat.ts */

import { collapseNarrationBuffer } from "@/lib/narration-dedupe";

export function checkpointChatText(narration: string, buildFix: boolean): string {
  const hint = buildFix
    ? "Corrigindo erros de build no servidor…"
    : "Retomando automaticamente no servidor…";
  const n = collapseNarrationBuffer(narration).trim();
  return n || hint;
}