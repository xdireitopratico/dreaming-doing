/**
 * FlowBuilderChatDock — FAB + overlay chat for vibe flow editing
 * Reuses ChatThread + ChatComposer (no Visual Edits). Does not resize the canvas.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { History, MessageCircle, Minimize2, Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Node, Edge } from "@/types/xyflow-react-shim";
import { ChatThread } from "@/components/chat/ChatThread";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { useFlowBuilderChat } from "./hooks/useFlowBuilderChat";
import "@/styles/forge-chat.css";
import "@/styles/forge-vibe-agent-chat.css";

const STORAGE_KEY = "forge-flow-chat-open";
const PANEL_MAX_H = "min(616px, 77vh)";

function loadOpenState(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

interface FlowBuilderChatDockProps {
  flowId: string;
  enabled: boolean;
  nodes: Node[];
  edges: Edge[];
  onApplyPatch: (nodes: Node[], edges: Edge[]) => void;
  onHighlightNodes?: (ids: string[]) => void;
  registerToggle?: (fn: () => void) => void;
  registerCollapse?: (fn: () => void) => void;
  onOpenChange?: (open: boolean) => void;
}

export function FlowBuilderChatDock({
  flowId,
  enabled,
  nodes,
  edges,
  onApplyPatch,
  onHighlightNodes,
  registerToggle,
  registerCollapse,
  onOpenChange,
}: FlowBuilderChatDockProps) {
  const [open, setOpenState] = useState(loadOpenState);
  const [historyOpen, setHistoryOpen] = useState(false);

  const setOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setOpenState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      onOpenChange?.(next);
      return next;
    });
  }, [onOpenChange]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    threadItems,
    running,
    initialized,
    unreadCount,
    conversations,
    conversationId,
    onSend,
    onStop,
    setChatVisible,
    startNewConversation,
    selectConversation,
  } = useFlowBuilderChat({
    flowId,
    enabled,
    nodes,
    edges,
    onApplyPatch,
    onHighlightNodes,
  });

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, [setOpen]);

  const collapse = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    registerToggle?.(toggle);
    registerCollapse?.(collapse);
  }, [registerToggle, registerCollapse, toggle, collapse]);

  useEffect(() => {
    onOpenChange?.(open);
    setChatVisible(open);
  }, [open, setChatVisible, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, threadItems.length, running]);

  if (!enabled) return null;

  return (
    <div className="forge-vibe-agent-chat pointer-events-none absolute inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            key="flow-chat-panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="forge-vibe-agent-chat__panel pointer-events-auto absolute bottom-20 right-6 flex w-[min(400px,calc(100%-3rem))] flex-col overflow-hidden"
            style={{ maxHeight: PANEL_MAX_H }}
          >
            <header
              className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5"
              style={{ borderColor: "color-mix(in srgb, var(--border-forge) 80%, transparent)" }}
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--text-primary)" }}>
                  Vibe Agent
                </p>
                <p className="text-[9px] truncate" style={{ color: "var(--text-muted)" }}>
                  Construa e tire dúvidas do agente no canvas
                </p>
              </div>
              <div className="relative flex items-center gap-1">
                <button
                  type="button"
                  className="forge-vibe-agent-chat__header-btn"
                  title="Nova conversa"
                  aria-label="Nova conversa"
                  onClick={() => void startNewConversation()}
                >
                  <Plus className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="forge-vibe-agent-chat__header-btn"
                  title="Histórico"
                  aria-label="Histórico de conversas"
                  onClick={() => setHistoryOpen((v) => !v)}
                >
                  <History className="size-3.5" />
                </button>
                {historyOpen && (
                  <div
                    className="absolute right-0 top-full z-10 mt-1 max-h-48 w-56 overflow-y-auto rounded-xl py-1 shadow-xl"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-forge)",
                    }}
                  >
                    {conversations.length === 0 ? (
                      <p className="px-3 py-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Nenhuma conversa ainda
                      </p>
                    ) : (
                      conversations.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-[10px] transition-colors hover:bg-white/5"
                          style={{
                            color: c.id === conversationId ? "var(--text-accent)" : "var(--text-secondary)",
                          }}
                          onClick={() => {
                            void selectConversation(c.id);
                            setHistoryOpen(false);
                          }}
                        >
                          <span className="block truncate font-medium">{c.title || "Conversa"}</span>
                          <span className="block text-[9px] opacity-70">
                            {new Date(c.updated_at || c.created_at).toLocaleString("pt-BR")}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className="forge-vibe-agent-chat__header-btn"
                  title="Minimizar"
                  aria-label="Minimizar chat"
                  onClick={collapse}
                >
                  <Minimize2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="forge-vibe-agent-chat__header-btn"
                  title="Fechar"
                  aria-label="Fechar chat"
                  onClick={collapse}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </header>

            <div
              ref={scrollRef}
              className="forge-chat-inner min-h-0 flex-1 overflow-y-auto"
              style={{ maxHeight: `calc(${PANEL_MAX_H} - 132px)` }}
            >
              {!initialized ? (
                <div className="flex items-center justify-center py-12">
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Conectando...
                  </span>
                </div>
              ) : threadItems.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[12px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Vibe Agent
                  </p>
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    Peça mudanças no fluxo, tire dúvidas ou peça para terminar o agente.
                  </p>
                </div>
              ) : (
                <div className="forge-messages">
                  <ChatThread items={threadItems} />
                </div>
              )}
            </div>

            <div className="forge-vibe-agent-composer-wrap shrink-0">
              <ChatComposer
                running={running}
                onSend={onSend}
                onStop={onStop}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        className={`forge-vibe-agent-chat__fab pointer-events-auto absolute bottom-6 right-6 flex size-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95${open ? " forge-vibe-agent-chat__fab--open" : ""}`}
        title={open ? "Minimizar chat (Ctrl+Shift+L)" : "Abrir Vibe Agent (Ctrl+Shift+L)"}
        aria-label={open ? "Minimizar chat" : "Abrir Vibe Agent"}
        onClick={toggle}
      >
        <MessageCircle className="size-5" />
        {!open && unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full text-[9px] font-bold"
            style={{ background: "#ef4444", color: "#fff" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
