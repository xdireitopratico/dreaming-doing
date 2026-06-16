/**
 * InspectorHistory — lista de snapshots do projeto (Fase 2.3).
 *
 * Lovable-style: cada item tem timestamp, label ou mensagem que o originou,
 * e botão "Restore" (que reusa `rollbackChatTurn`).
 */

import { useEffect, useState } from "react";
import { History, RotateCcw, MessageSquare } from "lucide-react";
import { listProjectSnapshots, type SnapshotHistoryItem } from "@/lib/snapshot-history";
import type { ChatMessage } from "@/lib/chat-types";
import { rollbackChatTurn } from "@/lib/rollback-chat-turn";

type InspectorHistoryProps = {
  projectId: string;
  conversationId: string;
  messages: ChatMessage[];
  onAfterRestore?: () => void;
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string, max = 64): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

export function InspectorHistory({ projectId, conversationId, messages, onAfterRestore }: InspectorHistoryProps) {
  const [items, setItems] = useState<SnapshotHistoryItem[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listProjectSnapshots(projectId, messages);
      if (!cancelled) setItems(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, messages]);

  if (items === null) {
    return (
      <p className="forge-inspector-empty" data-testid="inspector-history-loading">
        Carregando histórico…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="forge-inspector-history-empty" data-testid="inspector-history-empty">
        <History className="size-4 text-[var(--text-dim)]" />
        <p>Nenhum snapshot ainda. O FORGE cria automaticamente após mudanças do agente.</p>
      </div>
    );
  }

  const handleRestore = async (snap: SnapshotHistoryItem) => {
    if (!snap.sourceMessage) {
      setError("Não dá pra restaurar este snapshot (mensagem de origem não encontrada).");
      return;
    }
    if (snap.sourceMessage.role !== "user" && snap.sourceMessage.role !== "assistant") {
      setError("Mensagens de tool não são rollback-able.");
      return;
    }
    if (!confirm(`Restaurar o estado de ${formatTime(snap.createdAt)}? Mensagens após esse ponto serão removidas.`)) {
      return;
    }
    setError(null);
    setRestoringId(snap.id);
    try {
      await rollbackChatTurn({
        projectId,
        conversationId,
        messageId: snap.sourceMessage.id,
        role: snap.sourceMessage.role,
        messages,
      });
      onAfterRestore?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao restaurar");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="forge-inspector-history" data-testid="inspector-history">
      <p className="forge-inspector-section-label">
        {items.length} snapshot{items.length !== 1 ? "s" : ""}
      </p>

      {error && (
        <p className="forge-inspector-error" data-testid="inspector-history-error">
          {error}
        </p>
      )}

      <ul className="forge-inspector-history-list">
        {items.map((snap) => (
          <li key={snap.id} className="forge-inspector-history-item" data-testid="inspector-history-item">
            <div className="forge-inspector-history-item-body">
              <div className="forge-inspector-history-item-time">
                {formatTime(snap.createdAt)}
              </div>
              {snap.label && (
                <div className="forge-inspector-history-item-label">{snap.label}</div>
              )}
              {snap.sourceMessage && (
                <div className="forge-inspector-history-item-source">
                  <MessageSquare className="size-3" />
                  <span>{truncate(snap.sourceMessage.content)}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="forge-inspector-history-restore"
              onClick={() => void handleRestore(snap)}
              disabled={restoringId === snap.id || !snap.sourceMessage}
              data-testid="inspector-history-restore"
            >
              <RotateCcw className="size-3.5" />
              <span>{restoringId === snap.id ? "Restaurando…" : "Restaurar"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
