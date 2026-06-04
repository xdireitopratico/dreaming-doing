import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const STORAGE_KEY = "forge-editor-chat-ratio";
const SNAP_RATIOS = [0.28, 0.36, 0.44] as const;
const MIN_CHAT_PX = 280;
const MAX_CHAT_RATIO = 0.48;
const DEFAULT_RATIO = 0.32;

function loadRatio(): number {
  if (typeof window === "undefined") return DEFAULT_RATIO;
  const raw = localStorage.getItem(STORAGE_KEY);
  const n = raw ? Number.parseFloat(raw) : NaN;
  if (Number.isFinite(n) && n >= 0.18 && n <= MAX_CHAT_RATIO) return n;
  return DEFAULT_RATIO;
}

function nearestSnap(ratio: number): number {
  let best = SNAP_RATIOS[0];
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
  workspaceCode?: boolean;
}

export function EditorResizableLayout({
  chat,
  workspace,
  workspaceCode,
}: EditorResizableLayoutProps) {
  const [ratio, setRatio] = useState(loadRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(ratio));
  }, [ratio]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const next = Math.min(MAX_CHAT_RATIO, Math.max(MIN_CHAT_PX / rect.width, x / rect.width));
    setRatio(next);
  }, []);

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
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
    },
    [onPointerMove, endDrag],
  );

  const handleDoubleClick = () => {
    setRatio((r) => {
      const idx = SNAP_RATIOS.indexOf(nearestSnap(r) as (typeof SNAP_RATIOS)[number]);
      const next = SNAP_RATIOS[(idx + 1) % SNAP_RATIOS.length];
      return next;
    });
  };

  const chatPercent = `${Math.round(ratio * 1000) / 10}%`;

  return (
    <div ref={containerRef} className="forge-editor-canvas">
      <section className="forge-chat-panel" style={{ width: chatPercent }}>
        {chat}
      </section>

      <div
        className="forge-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        title="Arraste para redimensionar · duplo clique para alternar"
        onPointerDown={startDrag}
        onDoubleClick={handleDoubleClick}
      />

      <section
        className={`forge-workspace-panel${workspaceCode ? " forge-workspace-panel--code" : ""}`}
      >
        {workspace}
      </section>
    </div>
  );
}