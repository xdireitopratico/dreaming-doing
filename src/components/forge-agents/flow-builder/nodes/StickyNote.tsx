/**
 * StickyNote — n8n-style sticky note node
 * Editable content, color presets, resize handles
 */
import { memo, useCallback, useRef, useState, type FC } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

const STICKY_COLORS = [
  { id: "yellow", bg: "#fef08a", text: "#854d0e", border: "#eab308" },
  { id: "green", bg: "#bbf7d0", text: "#166534", border: "#22c55e" },
  { id: "blue", bg: "#bfdbfe", text: "#1e40af", border: "#3b82f6" },
  { id: "purple", bg: "#e9d5ff", text: "#6b21a8", border: "#a855f7" },
  { id: "pink", bg: "#fbcfe8", text: "#9d174d", border: "#ec4899" },
  { id: "orange", bg: "#fed7aa", text: "#9a3412", border: "#f97316" },
  { id: "gray", bg: "#e5e7eb", text: "#374151", border: "#6b7280" },
];

const DEFAULT_COLOR = STICKY_COLORS[0];

export const StickyNote: FC<NodeProps> = memo(function StickyNote({ data, selected, id: _id }) {
  const noteData = (data || {}) as Record<string, any>;
  const [text, setText] = useState(noteData.text || "Escreva seu texto aqui...");
  const [colorId, setColorId] = useState(noteData.color || "yellow");
  const [editing, setEditing] = useState(false);
  const color = STICKY_COLORS.find((c) => c.id === colorId) || DEFAULT_COLOR;
  const divRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: noteData.width || 200, h: noteData.height || 150 });
  const [resizing, setResizing] = useState(false);

  const handleBlur = useCallback(() => {
    if (divRef.current) {
      setText(divRef.current.textContent || "");
    }
    setEditing(false);
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;

    const onMouseMove = (ev: MouseEvent) => {
      setSize({ w: Math.max(120, startW + ev.clientX - startX), h: Math.max(80, startH + ev.clientY - startY) });
    };
    const onMouseUp = () => {
      setResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [size]);

  return (
    <div
      className={`sticky-note ${selected ? "sticky-selected" : ""} ${resizing ? "sticky-resizing" : ""}`}
      style={{
        width: size.w,
        height: size.h,
        background: color.bg,
        border: `2px solid ${selected ? color.border : color.border}66`,
        borderRadius: 12,
        boxShadow: selected
          ? `0 0 0 3px ${color.border}, 0 4px 20px rgba(0,0,0,0.3)`
          : "0 2px 8px rgba(0,0,0,0.2)",
        transition: resizing ? "none" : "box-shadow 0.15s, border-color 0.15s",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        cursor: "grab",
        overflow: "hidden",
      }}
    >
      {/* Color picker bar (top) */}
      {selected && (
        <div
          className="flex gap-1 px-2 pt-1.5 pb-1 nodrag nopan"
          style={{ background: `${color.border}22` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {STICKY_COLORS.map((c) => (
            <button
              key={c.id}
              title={c.id}
              onClick={() => setColorId(c.id)}
              style={{
                width: 12, height: 12, borderRadius: "50%",
                background: c.bg,
                border: `2px solid ${c.id === colorId ? c.border : "transparent"}`,
                cursor: "pointer",
                transition: "transform 0.1s",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.transform = "scale(1.3)"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.transform = "scale(1)"; }}
            />
          ))}
        </div>
      )}

      {/* Editable content */}
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        className="flex-1 px-3 py-2 text-sm outline-none nodrag leading-relaxed overflow-y-auto"
        style={{ color: color.text, cursor: "text" }}
        onFocus={() => setEditing(true)}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === "Escape") { divRef.current?.blur(); } }}
        dangerouslySetInnerHTML={{
          __html: text,
        }}
      />

      {/* Resize handle (bottom-right) */}
      <div
        className="nodrag nopan"
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute", bottom: 0, right: 0,
          width: 16, height: 16, cursor: "nwse-resize",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: selected ? 0.6 : 0,
          transition: "opacity 0.15s",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color.text} strokeWidth="2" opacity={0.5}>
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </div>

      {/* Input handle (top center) — always show */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2 !border-[#1a1a2e] !bg-[#5555aa]"
        style={{ opacity: 0 }}
      />
      {/* Output handle (bottom center) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !border-2 !border-[#1a1a2e] !bg-[#5555aa]"
        style={{ opacity: 0 }}
      />
    </div>
  );
});
