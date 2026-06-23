/**
 * snapshot-history — lista de snapshots do projeto com a mensagem que
 * os originou (Fase 2.3).
 *
 * O `project_snapshots.tree` é o JSONB com a árvore de arquivos no momento
 * do snapshot. Não traz (ainda) a referência à mensagem que o criou. Aqui
 * cruzamos com a tabela `messages` por timestamp aproximado: a primeira
 * user message com `created_at <= snapshot.created_at` é a "origem".
 *
 * Read-only no Lovable-style: o usuário vê a lista, vê qual mensagem
 * criou, e clica "Restore" (que reaproveita `rollbackChatTurn`).
 */

import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/lib/chat-types";

export type SnapshotHistoryItem = {
  id: string;
  createdAt: string;
  label: string | null;
  /** Mensagem que originou o snapshot (heurística: 1ª user message
   *  com created_at <= snapshot.created_at). Pode ser null se não
   *  encontrarmos (ex: snapshot criado em import). */
  sourceMessage: ChatMessage | null;
};

export async function listProjectSnapshots(
  projectId: string,
  messages: ChatMessage[],
): Promise<SnapshotHistoryItem[]> {
  const { data, error } = await supabase
    .from("project_snapshots")
    .select("id, label, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[snapshot-history] list failed:", error.message);
    return [];
  }

  const userMessages = (messages as ChatMessage[])
    .filter((m: ChatMessage) => m.role === "user" && m.timestamp)
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  return ((data ?? []) as Array<{ id: string; label: string | null; created_at: string }>).map((row) => {
    const snapTs = row.created_at as string;
    const snapMs = new Date(snapTs).getTime();
    const source = [...userMessages]
      .reverse()
      .find((m) => m.timestamp <= snapMs) ?? null;
    return {
      id: row.id as string,
      createdAt: snapTs,
      label: (row.label as string | null) ?? null,
      sourceMessage: source,
    };
  });
}
