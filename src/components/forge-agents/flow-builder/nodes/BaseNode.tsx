/**
 * BaseNode — n8n-inspired canvas node card
 *
 * Card: 96×96px, border-radius 12px, dark bg (#1a1a2e), 1.5px border.
 * Icon centered in card. Label + subtitle rendered BELOW card (absolute).
 *
 * States: idle | success | error | running | waiting | disabled | pinned
 * Running/Waiting uses animated conic-gradient border via CSS @property.
 *
 * Card types:
 *   "default" — 96×96 square, 12px radius (most nodes)
 *   "trigger" — asymmetric (top-left 36px, rest 12px)
 *   "configuration" — pill/capsule
 */
import { Handle, Position, type NodeProps } from "@/types/xyflow-react-shim";
import { NodeIcon, type NodeIconSource } from "./NodeIcon";
import { type NodeStatus, NodeStatusIcon } from "./CanvasNodeStatusIcons";

export type CardType = "default" | "trigger" | "configuration" | "configurable";

interface BaseNodeProps {
  icon?: NodeIconSource;
  label: string;
  subtitle?: string;
  selected?: boolean;
  status?: NodeStatus;
  cardType?: CardType;
  showTarget?: boolean;
  showSource?: boolean;
  children?: React.ReactNode;
  disabled?: boolean;
  sourcePosition?: Position;
  targetPosition?: Position;
}

const CARD_STYLES: Record<CardType, { shape: string; size: string }> = {
  default: { shape: "rounded-xl", size: "w-24 h-24" },
  trigger: { shape: "rounded-[36px_12px_12px_12px]", size: "w-24 h-24" },
  configuration: { shape: "rounded-full", size: "w-28 h-10" },
  configurable: { shape: "rounded-xl", size: "w-36 h-24" },
};

export function BaseNode({
  icon, label, subtitle, selected, status = "idle", cardType = "default",
  showTarget = true, showSource = true, children, disabled,
  sourcePosition = Position.Bottom, targetPosition = Position.Top,
}: BaseNodeProps) {
  const cs = CARD_STYLES[cardType];
  const hasStatus = status !== "idle";

  const borderClass = selected
    ? "border-[1.5px] border-white"
    : status === "error" ? "border-[1.5px] border-red-500/60"
    : status === "success" ? "border-[1.5px] border-green-500/60"
    : status === "running" || status === "waiting"
      ? "border-[1.5px] border-transparent animate-node-gradient"
      : "border-[1.5px] border-[#2a2a4a]";

  return (
    <div className={`relative ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      {showTarget && (
        <Handle type="target" position={targetPosition} className="!w-3 !h-3 !border-2 !border-[#1a1a2e] !bg-[#5555aa]" />
      )}

      <div
        className={`relative flex items-center justify-center ${cs.size} ${cs.shape} ${borderClass} bg-[#1a1a2e] shadow-lg ${selected ? "shadow-white/10" : "shadow-black/30"} transition-shadow duration-150 hover:shadow-white/5`}
        style={{ overflow: "hidden" }}
        title={subtitle || label}
      >
        {(status === "running" || status === "waiting") && (
          <div
            className="absolute inset-0 rounded-[inherit]"
            style={{
              padding: "1.5px",
              background: "conic-gradient(from var(--node-gradient-angle, 0deg), transparent 0deg, #5555aa 90deg, #8888ff 180deg, transparent 270deg, transparent 360deg)",
              WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              animation: "node-gradient-rotate 3s linear infinite",
            }}
          />
        )}

        {icon && <NodeIcon source={icon} size={22} />}

        {hasStatus && (
          <div className="absolute -top-1 -right-1 z-10">
            <NodeStatusIcon status={status} size={10} />
          </div>
        )}
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none" style={{ top: "calc(100% + 6px)", minWidth: "192px" }}>
        <div className="text-[11px] font-medium leading-tight truncate" style={{ color: "var(--ps-cream, #f0e6d7)" }}>
          {label}
        </div>
        {subtitle && (
          <div className="text-[9px] leading-tight mt-0.5 truncate" style={{ color: "var(--ps-cream-40, rgba(240,230,215,0.4))" }}>
            {subtitle}
          </div>
        )}
      </div>

      {showSource && (
        <Handle type="source" position={sourcePosition} className="!w-3 !h-3 !border-2 !border-[#1a1a2e] !bg-[#5555aa]" />
      )}

      {children}
    </div>
  );
}

export function injectN8nNodeAnimations() {
  if (typeof document === "undefined") return;
  const id = "n8n-node-animations";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    @property --node-gradient-angle {
      syntax: "<angle>"; initial-value: 0deg; inherits: false;
    }
    @keyframes node-gradient-rotate {
      from { --node-gradient-angle: 0deg; }
      to { --node-gradient-angle: 360deg; }
    }
    .animate-node-gradient { animation: node-gradient-rotate 3s linear infinite; }
  `;
  document.head.appendChild(style);
}
