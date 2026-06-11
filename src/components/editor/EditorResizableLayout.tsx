import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { EditorMobilePanel } from "@/components/editor/EditorMobileHeader";

const STORAGE_KEY = "forge-editor-chat-ratio";
const COLLAPSED_KEY = "forge-editor-chat-collapsed";
const SNAP_RATIOS = [0.3, 0.36, 0.44] as const;
const MIN_CHAT_PX = 280;
const MAX_CHAT_RATIO = 0.5;
const DEFAULT_RATIO = 0.3;

function loadRatio(): number {
  if (typeof window === "undefined") return DEFAULT_RATIO;
  const raw = localStorage.getItem(STORAGE_KEY);
  const n = raw ? Number.parseFloat(raw) : NaN;
  if (Number.isFinite(n) && n >= 0.22 && n <= MAX_CHAT_RATIO) return n;
  return DEFAULT_RATIO;
}

function loadCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(COLLAPSED_KEY) === "1";
}

function nearestSnap(ratio: number): number {
  let best: number = SNAP_RATIOS[0];
  let dist = Math.abs(ratio - best);
  for (const s of SNAP_RATIOS) {
    const d = Math.abs(ratio - s);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  return best;
}

interface EditorResizableLayoutProps {
  chat: ReactNode;
  workspace: ReactNode;
  chatHeader?: ReactNode;
  workspaceHeader?: ReactNode;
  mobileHeader?: ReactNode;
  mobileTabBar?: ReactNode;
  workspaceCode?: boolean;
  isMobile?: boolean;
  mobilePanel?: EditorMobilePanel;
}

export function EditorResizableLayout({
  chat,
  workspace,
  chatHeader,
  workspaceHeader,
  mobileHeader,
  mobileTabBar,
  workspaceCode,
  isMobile = false,
  mobilePanel = "chat",
}: EditorResizableLayoutProps) {
  const [ratio, setRatio] = useState(loadRatio);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(ratio));
  }, [ratio]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (isMobile || !draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const next = Math.min(MAX_CHAT_RATIO, Math.max(MIN_CHAT_PX / rect.width, x / rect.width));
      setRatio(next);
    },
    [isMobile],
  );

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setRatio((r) => nearestSnap(r));
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onPointerMove]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if (isMobile || collapsed) return;
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
    },
    [onPointerMove, endDrag, collapsed, isMobile],
  );

  const showChatPanel = isMobile ? mobilePanel === "chat" : !collapsed;
  const showWorkspacePanel = isMobile ? mobilePanel === "preview" || mobilePanel === "code" : true;

  const handleDoubleClick = () => {
    if (collapsed) return;
    setRatio(DEFAULT_RATIO);
  };

  const toggleCollapsed = () => setCollapsed((c) => !c);

  // expose toggle globally so chat header button can invoke it via custom event
  useEffect(() => {
    const handler = () => toggleCollapsed();
    window.addEventListener("forge:toggle-chat-collapsed", handler);
    return () => window.removeEventListener("forge:toggle-chat-collapsed", handler);
  }, []);

  const chatPct = collapsed ? "0%" : `${Math.round(ratio * 1000) / 10}%`;

  return (
    <div
      ref={containerRef}
      className={`forge-editor-canvas${!isMobile && (chatHeader || workspaceHeader) ? " forge-editor-canvas--split-header" : ""}${!isMobile && collapsed ? " forge-editor-canvas--collapsed" : ""}${isMobile ? " forge-editor-canvas--mobile" : ""}`}
      style={
        isMobile
          ? undefined
          : ({
              "--forge-chat-width": chatPct,
            } as React.CSSProperties)
      }
      data-mobile-panel={isMobile ? mobilePanel : undefined}
    >
      {isMobile && mobileHeader ? (
        <header className="forge-mobile-editor-header">{mobileHeader}</header>
      ) : null}

      {!isMobile && !collapsed && chatHeader && (
        <header className="forge-chat-header">{chatHeader}</header>
      )}
      {!isMobile && workspaceHeader && (
        <header className="forge-workspace-header">
          {collapsed && (
            <button
              type="button"
              className="forge-chat-expand-btn"
              onClick={toggleCollapsed}
              title="Expandir chat"
              aria-label="Expandir chat"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}
          {workspaceHeader}
        </header>
      )}

      {showChatPanel && <section className="forge-chat-panel">{chat}</section>}

      {!isMobile && !collapsed && (
        <div
          className="forge-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(ratio * 100)}
          title="Arraste · duplo clique = 30/70"
          onPointerDown={startDrag}
          onDoubleClick={handleDoubleClick}
        />
      )}

      {showWorkspacePanel && (
        <section
          className={`forge-workspace-panel${workspaceCode ? " forge-workspace-panel--code" : ""}`}
        >
          {workspace}
        </section>
      )}

      {isMobile && mobileTabBar}
    </div>
  );
}

export { PanelLeftClose, PanelLeftOpen };
