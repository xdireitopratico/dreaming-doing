import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/lib/chat-types";

export type RollbackChatTurnParams = {
  projectId: string;
  conversationId: string;
  messageId: string;
  role: "user" | "assistant";
  messages: ChatMessage[];
};

export type RollbackChatTurnResult = { ok: true } | { ok: false; error: string };

async function restoreSnapshotTree(
  projectId: string,
  tree: Record<string, string>,
): Promise<string | null> {
  const { data: existing, error: listErr } = await supabase
    .from("project_files")
    .select("id")
    .eq("project_id", projectId);

  if (listErr) return listErr.message;

  if (existing && existing.length > 0) {
    const { error: delErr } = await supabase
      .from("project_files")
      .delete()
      .eq("project_id", projectId);
    if (delErr) return delErr.message;
  }

  const inserts = Object.entries(tree).map(([path, content]) => ({
    project_id: projectId,
    path,
    content,
  }));

  if (inserts.length === 0) return null;

  const { error: upsertErr } = await supabase.from("project_files").upsert(inserts);
  return upsertErr?.message ?? null;
}

async function findSnapshotBefore(
  projectId: string,
  beforeMs: number,
): Promise<Record<string, string> | null> {
  const beforeIso = new Date(beforeMs).toISOString();
  const { data, error } = await supabase
    .from("project_snapshots")
    .select("tree, created_at")
    .eq("project_id", projectId)
    .lt("created_at", beforeIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.tree || typeof data.tree !== "object") return null;
  return data.tree as Record<string, string>;
}

/** Rollback de turno: apaga mensagens a partir do âncora e restaura arquivos do snapshot anterior (se houver). Sem retry. */
export async function rollbackChatTurn(
  params: RollbackChatTurnParams,
): Promise<RollbackChatTurnResult> {
  const { projectId, conversationId, messageId, role, messages } = params;

  const msgIndex = messages.findIndex((m) => m.id === messageId && m.role === role);
  if (msgIndex === -1) {
    return { ok: false, error: "Mensagem não encontrada." };
  }

  let anchorIndex = msgIndex;
  if (role === "assistant") {
    const userIdx = msgIndex - 1;
    if (userIdx < 0 || messages[userIdx]?.role !== "user") {
      return { ok: false, error: "Não foi possível localizar o prompt deste turno." };
    }
    anchorIndex = userIdx;
  }

  const anchor = messages[anchorIndex];
  if (!anchor || anchor.role !== "user") {
    return { ok: false, error: "Âncora de rollback inválida." };
  }

  const idsToDelete = messages.slice(anchorIndex).map((m) => m.id);
  if (idsToDelete.length === 0) {
    return { ok: false, error: "Nada para reverter neste turno." };
  }

  const snapshotTree = await findSnapshotBefore(projectId, anchor.timestamp);
  if (snapshotTree) {
    const restoreErr = await restoreSnapshotTree(projectId, snapshotTree);
    if (restoreErr) {
      return { ok: false, error: `Falha ao restaurar arquivos: ${restoreErr}` };
    }
  }

  const { error: deleteErr } = await supabase
    .from("messages")
    .delete()
    .eq("conversation_id", conversationId)
    .in("id", idsToDelete);

  if (deleteErr) {
    return { ok: false, error: deleteErr.message || "Erro ao remover mensagens." };
  }

  return { ok: true };
}
