/**
 * FlowBuilderChatDock — FAB + overlay chat for vibe flow editing
 * Reuses ChatThread + ChatComposer (no Visual Edits). Does not resize the canvas.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Minimize2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Node, Edge } from "@xyflow/react";
import { ChatThread } from "@/components/chat/ChatThread";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { useFlowBuilderChat } from "./hooks/useFlowBuilderChat";
import "@/styles/forge-chat.css";

const STORAGE_KEY = "forge-flow-chat-open";

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
    onSend,
    onStop,
    setChatVisible,
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
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            key="flow-chat-panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto absolute bottom-20 right-6 flex w-[min(400px,calc(100%-3rem))] flex-col overflow-hidden rounded-2xl shadow-2xl"
            style={{
              maxHeight: "min(560px, 70vh)",
              background: "rgba(12, 14, 24, 0.92)",
              border: "1px solid var(--ps-border, rgba(255,255,255,0.1))",
              backdropFilter: "blur(12px)",
            }}
          >
            <header
              className="flex shrink-0 items-center justify-between gap-2 px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--ps-border, rgba(255,255,255,0.08))" }}
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--ps-cream, #f5f0e8)" }}>
                  Vibe Builder
                </p>
                <p className="text-[9px] truncate" style={{ color: "var(--ps-cream-40, rgba(245,240,232,0.4))" }}>
                  Edite o fluxo por linguagem natural
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg p-1.5 transition-colors hover:bg-white/5"
                  title="Minimizar"
                  aria-label="Minimizar chat"
                  onClick={collapse}
                >
                  <Minimize2 className="size-4" style={{ color: "var(--ps-cream-60)" }} />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-1.5 transition-colors hover:bg-white/5"
                  title="Fechar"
                  aria-label="Fechar chat"
                  onClick={collapse}
                >
                  <X className="size-4" style={{ color: "var(--ps-cream-60)" }} />
                </button>
              </div>
            </header>

            <div
              ref={scrollRef}
              className="forge-chat-inner min-h-0 flex-1 overflow-y-auto"
              style={{ maxHeight: "calc(min(560px, 70vh) - 120px)" }}
            >
              {!initialized ? (
                <div className="flex items-center justify-center py-12">
                  <span className="text-[11px]" style={{ color: "var(--ps-cream-40)" }}>
                    Conectando...
                  </span>
                </div>
              ) : threadItems.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[12px] font-medium mb-1" style={{ color: "var(--ps-cream-60)" }}>
                    Descreva a mudança
                  </p>
                  <p className="text-[10px] leading-relaxed" style={{ color: "var(--ps-cream-25)" }}>
                    Ex: &quot;Adicione um nó RAG entre o LLM e o output guard&quot;
                  </p>
                </div>
              ) : (
                <div className="forge-messages">
                  <ChatThread items={threadItems} />
                </div>
              )}
            </div>

            <div className="shrink-0 px-2 pb-2 pt-1">
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
        className="pointer-events-auto absolute bottom-6 right-6 flex size-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{
          background: open ? "var(--ps-accent, #3b82f6)" : "rgba(30, 58, 138, 0.9)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff",
        }}
        title={open ? "Minimizar chat (Ctrl+Shift+L)" : "Abrir chat (Ctrl+Shift+L)"}
        aria-label={open ? "Minimizar chat" : "Abrir chat vibe builder"}
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