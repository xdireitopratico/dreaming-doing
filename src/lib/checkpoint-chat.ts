/** Espelho testável de supabase/functions/agent-run/checkpoint-chat.ts */

export function checkpointChatText(narration: string, buildFix: boolean): string {
  const hint = buildFix
    ? "Corrigindo erros de build no servidor…"
    : "Retomando automaticamente no servidor…";
  const n = narration.trim();
  return n || hint;
}