/**
 * BaseNode — n8n-style canvas node card
 *
 * Card: Dynamic sizing via calculateNodeSize().
 * Icon positioned top-center (48px canvas / 36px configuration).
 * Label + subtitle rendered BELOW card (absolute).
 *
 * States: idle | success | error | running | waiting | disabled | pinned | warning
 *
 * Running/Waiting uses `::after` pseudo-element with conic-gradient animated border.
 * Selected uses box-shadow ring.
 * Disabled has strikethrough line.
 * Placeholder uses dashed border.
 */
import { useMemo } from "react";
import { Handle, Position, type NodeProps } from "@/types/xyflow-react-shim";
import { NodeIcon, getNodeIconSize, type NodeIconSource, type NodeIconContext } from "./NodeIcon";
import { type NodeStatus, NodeStatusIcon } from "./CanvasNodeStatusIcons";
import { NodeToolbar } from "./NodeToolbar";
import { SettingsIcons } from "./SettingsIcons";

/** Extract status from a ReactFlow node's data (supports both camelCase status and runtime injection). */
export function resolveNodeStatus(data: unknown): NodeStatus {
  const d = data as Record<string, unknown> | undefined;
  const raw = d?.status ?? d?.execution_status ?? "idle";
  const allowed: NodeStatus[] = ["idle","success","error","running","waiting","disabled","pinned","warning"];
  return allowed.includes(raw as NodeStatus) ? (raw as NodeStatus) : "idle";
}

export type CardType = "default" | "trigger" | "configuration" | "configurable" | "placeholder";

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
  /** Hint for icon sizing. */
  iconContext?: NodeIconContext;
  /** Number of main input handles (affects height). */
  mainInputCount?: number;
  /** Number of main output handles (affects height). */
  mainOutputCount?: number;
  /** Number of non-main input handles (affects width for configurable). */
  nonMainInputCount?: number;
  sourcePosition?: Position;
  targetPosition?: Position;
  /** Toolbar callbacks */
  onRun?: () => void;
  onDelete?: () => void;
  onToggle?: () => void;
  onToolbarContextMenu?: () => void;
  readOnly?: boolean;
  /** Settings indicators */
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  retryOnFail?: boolean;
  continueOnError?: boolean;
}

// ── Sizing ──

const GRID = 16;
const DEFAULT_W = GRID * 6;   // 96
const DEFAULT_H = GRID * 6;   // 96
const CONFIG_RADIUS = (GRID * 5) / 2; // 40
const CONFIG_W = CONFIG_RADIUS * 2;   // 80
const CONFIG_H = CONFIG_RADIUS * 2;   // 80
const CONFIGURABLE_W = GRID * 16;     // 256

function calcNodeSize(
  cardType: CardType,
  mainIn: number,
  mainOut: number,
  nonMain: number,
): { width: number; height: number } {
  const maxVertical = Math.max(mainIn, mainOut, 1);
  const height = DEFAULT_H + Math.max(0, maxVertical - 2) * GRID * 2;

  if (cardType === "configurable") {
    const portCount = Math.max(2, nonMain);
    return {
      width: (CONFIG_RADIUS * 2 + GRID * (1 + (portCount - 1) * 3)),
      height,
    };
  }

  if (cardType === "configuration") {
    return { width: CONFIG_W, height: CONFIG_H };
  }

  return { width: DEFAULT_W, height };
}

// ── Shape CSS ──

function cardShape(cardType: CardType, h: number): string {
  switch (cardType) {
    case "trigger":
      return "36px 12px 12px 36px";
    case "configuration":
      return `${h / 2}px`;
    case "placeholder":
      return "12px";
    default:
      return "12px";
  }
}

// ── Border style ──

function borderStyle(status: NodeStatus, selected: boolean): string {
  if (selected) return "1.5px solid rgba(255,255,255,0.6)";
  switch (status) {
    case "success": return "2px solid rgb(34 197 94)";
    case "error": return "1.5px solid rgb(239 68 68 / 0.6)";
    case "pinned": return "2px solid #5555aa";
    case "warning": return "2px solid #f59e0b";
    case "running":
    case "waiting":
      return "1.5px solid transparent";
    case "disabled":
      return "1.5px solid rgba(255,255,255,0.08)";
    default:
      return "1.5px solid #2a2a4a";
  }
}

// ── Component ──

export function BaseNode({
  icon, label, subtitle, selected = false, status = "idle", cardType = "default",
  showTarget = true, showSource = true, children, disabled = false,
  iconContext = "canvas",
  mainInputCount = 1, mainOutputCount = 1, nonMainInputCount = 0,
  sourcePosition = Position.Bottom, targetPosition = Position.Top,
  onRun, onDelete, onToggle, onToolbarContextMenu, readOnly = false,
  alwaysOutputData, executeOnce, retryOnFail, continueOnError,
}: BaseNodeProps) {
  const size = useMemo(
    () => calcNodeSize(cardType, mainInputCount, mainOutputCount, nonMainInputCount),
    [cardType, mainInputCount, mainOutputCount, nonMainInputCount],
  );
  const radius = useMemo(() => cardShape(cardType, size.height), [cardType, size.height]);
  const isRunningOrWaiting = status === "running" || status === "waiting";
  const iconSize = getNodeIconSize(iconContext);

  return (
    <div
      className={`group-node relative ${disabled ? "node-disabled" : ""}`}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      {/* Toolbar */}
      <NodeToolbar
        onRun={onRun}
        onDelete={onDelete}
        onToggle={onToggle}
        onContextMenu={onToolbarContextMenu}
        disabled={disabled}
        readOnly={readOnly}
      />

      {showTarget && (
        <Handle
          type="target"
          position={targetPosition}
          className="!w-3 !h-3 !border-2 !border-[#1a1a2e] !bg-[#5555aa]"
        />
      )}

      {/* Card */}
      <div
        className={`relative flex items-center justify-center bg-[#1a1a2e] shadow-lg transition-shadow duration-150 hover:shadow-white/5 ${
          cardType === "placeholder" ? "node-placeholder" : ""
        } ${selected ? "node-selected" : ""} ${
          status === "running" ? "node-running" : ""
        } ${status === "waiting" ? "node-waiting" : ""} ${
          status === "success" ? "node-success" : ""
        } ${status === "error" ? "node-error" : ""} ${
          status === "pinned" ? "node-pinned" : ""
        } ${status === "warning" ? "node-warning" : ""}`}
        style={{
          width: size.width,
          height: size.height,
          borderRadius: radius,
          border: borderStyle(status, selected),
          overflow: "hidden",
        }}
        title={subtitle || label}
      >
        {/* Animated gradient overlay for running/waiting */}
        {isRunningOrWaiting && (
          <div
            className="absolute inset-0 node-gradient-overlay"
            style={{
              padding: "1.5px",
              borderRadius: radius,
              background: `conic-gradient(from var(--node-gradient-angle, 0deg), transparent 0deg, #5555aa 90deg, #8888ff 180deg, transparent 270deg, transparent 360deg)`,
              WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              animation:
                status === "running"
                  ? "node-gradient-rotate 1.5s linear infinite"
                  : "node-gradient-rotate 4.5s linear infinite",
            }}
          />
        )}

        {/* Icon */}
        {icon && (
          <div className="flex items-center justify-center">
            <NodeIcon source={icon} size={iconSize} />
          </div>
        )}

        {/* Settings indicators — top-right */}
        {(alwaysOutputData || executeOnce || retryOnFail || continueOnError) && (
          <SettingsIcons
            alwaysOutputData={alwaysOutputData}
            executeOnce={executeOnce}
            retryOnFail={retryOnFail}
            continueOnError={continueOnError}
          />
        )}

        {/* Status badge — top-right */}
        {status !== "idle" && status !== "disabled" && (
          <div className="absolute -top-1 -right-1 z-10">
            <NodeStatusIcon status={status} size={10} />
          </div>
        )}

        {children}
      </div>

      {/* Disabled strikethrough */}
      {disabled && (
        <div
          className="absolute pointer-events-none"
          style={{
            border: "1px solid rgba(255,255,255,0.2)",
            top: size.height / 2 - 1,
            left: -4,
            width: size.width + 12,
          }}
        />
      )}

      {/* Label + Subtitle below card */}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none"
        style={{ top: size.height + 6, minWidth: Math.max(size.width * 2, 192) }}
      >
        <div
          className="text-[11px] font-medium leading-tight truncate"
          style={{ color: "var(--ps-cream, #f0e6d7)" }}
        >
          {label}
        </div>
        {subtitle && (
          <div
            className="text-[9px] leading-tight mt-0.5 truncate"
            style={{ color: "var(--ps-cream-40, rgba(240,230,215,0.4))" }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {showSource && (
        <Handle
          type="source"
          position={sourcePosition}
          className="!w-3 !h-3 !border-2 !border-[#1a1a2e] !bg-[#5555aa]"
        />
      )}
    </div>
  );
}

// ── Animation injection ──

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
    .node-gradient-overlay {
      animation: node-gradient-rotate 1.5s linear infinite;
    }
    .node-selected {
      box-shadow: 0 0 0 6px rgba(255,255,255,0.15);
    }
    .node-success {
      box-shadow: 0 0 0 1px rgba(34,197,94,0.2);
    }
    .node-error {
      box-shadow: 0 0 0 1px rgba(239,68,68,0.2);
    }
    .node-pinned {
      box-shadow: 0 0 0 1px rgba(85,85,170,0.3);
    }
    .node-warning {
      box-shadow: 0 0 0 1px rgba(245,158,11,0.2);
    }
    .node-running {
      box-shadow: 0 0 8px rgba(85,85,170,0.3);
    }
    .node-waiting {
      box-shadow: 0 0 8px rgba(85,85,170,0.15);
    }
    .node-placeholder {
      border: 2px dashed rgba(255,255,255,0.15) !important;
      background: rgba(255,255,255,0.03) !important;
      cursor: pointer;
    }
    .node-placeholder:hover {
      border-color: var(--ps-primary, #3b82f6) !important;
    }
    .node-placeholder:not(:hover) .node-icon-color {
      color: rgba(255,255,255,0.3);
    }
  `;
  document.head.appendChild(style);
}
