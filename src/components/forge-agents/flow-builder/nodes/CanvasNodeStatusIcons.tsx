/**
 * CanvasNodeStatusIcons — n8n-style status indicators for canvas nodes
 *
 * Priority (highest wins): error > warning > running > waiting > pinned > success > idle
 */
export type NodeStatus =
  | "idle"
  | "success"
  | "error"
  | "running"
  | "waiting"
  | "disabled"
  | "pinned"
  | "warning";

interface StatusIconProps { size?: number }

export function SuccessMark({ size = 16 }: StatusIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-green-500">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ErrorMark({ size = 16 }: StatusIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-red-500">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
      <path d="M15 9l-6 6m0-6l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function WarningMark({ size = 16 }: StatusIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-orange-500">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="currentColor" opacity="0.2" />
      <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function RunningSpinner({ size = 16 }: StatusIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-blue-500 animate-spin">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function DisabledPower({ size = 16 }: StatusIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-gray-500">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <path d="M12 2v8m6.36-4.36A10 10 0 1 1 5.64 5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PinnedMark({ size = 16 }: StatusIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-blue-400">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Render the appropriate status icon.
 * Priority: error > warning > running > waiting > pinned > success > idle
 */
export function NodeStatusIcon({ status, size = 16 }: { status: NodeStatus; size?: number }) {
  switch (status) {
    case "error": return <ErrorMark size={size} />;
    case "warning": return <WarningMark size={size} />;
    case "running": return <RunningSpinner size={size} />;
    case "waiting": return <RunningSpinner size={size} />;
    case "pinned": return <PinnedMark size={size} />;
    case "success": return <SuccessMark size={size} />;
    case "disabled": return <DisabledPower size={size} />;
    default: return null;
  }
}
