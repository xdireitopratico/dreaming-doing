import { useMemo } from "react";
import { buildWireframeDiagramModel } from "@/lib/chat/wireframe-diagram";

type WireframeBlockProps = {
  text: string;
};

/** Wireframe ASCII — renderiza como diagrama visual quando detecta estrutura de caixas. */
export function WireframeBlock({ text }: WireframeBlockProps) {
  const body = text.trimEnd();
  const diagram = useMemo(() => buildWireframeDiagramModel(body), [body]);
  if (!body) return null;

  if (!diagram.hasVisualFrame) {
    return (
      <pre
        className="forge-chat-wireframe my-2 overflow-x-auto rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-2)] p-3 font-mono text-[11px] leading-snug text-[var(--forge-text)]"
        data-testid="wireframe-block"
      >
        {body}
      </pre>
    );
  }

  return (
    <div
      className="forge-chat-wireframe my-3 overflow-x-auto rounded-xl border border-[var(--forge-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.22)]"
      data-testid="wireframe-block"
    >
      <svg
        viewBox={diagram.viewBox}
        className="h-auto min-w-full"
        style={{ width: Math.max(diagram.width, 540) }}
        role="img"
        aria-label="Wireframe diagram"
      >
        <defs>
          <pattern id="forge-wireframe-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="rgba(255,255,255,0.035)"
              strokeWidth="1"
            />
          </pattern>
          <linearGradient id="forge-wireframe-panel" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
        </defs>

        <rect
          x="0"
          y="0"
          width={diagram.width}
          height={diagram.height}
          rx="18"
          fill="url(#forge-wireframe-grid)"
        />

        {diagram.rects.map((rect, index) => (
          <rect
            key={`${rect.x}-${rect.y}-${rect.width}-${rect.height}`}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            rx="8"
            fill="url(#forge-wireframe-panel)"
            stroke={index === 0 ? "rgba(250, 204, 21, 0.42)" : "rgba(255,255,255,0.14)"}
            strokeWidth={index === 0 ? 1.6 : 1.1}
          />
        ))}

        {diagram.segments.map((segment) => (
          <line
            key={`${segment.x1}-${segment.y1}-${segment.x2}-${segment.y2}`}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            stroke="rgba(244, 244, 245, 0.9)"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        ))}

        {diagram.labels.map((label) => (
          <text
            key={`${label.row}-${label.col}-${label.text}`}
            x={18 + label.col * 12}
            y={18 + label.row * 20 + 14}
            fill="rgba(244, 244, 245, 0.92)"
            fontFamily="JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="11"
            letterSpacing="0.2"
          >
            {label.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
