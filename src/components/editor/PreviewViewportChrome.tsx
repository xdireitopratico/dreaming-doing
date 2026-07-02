import { RefreshCw } from "lucide-react";
import {
  PREVIEW_DEVICE_OPTIONS as DEVICE_OPTIONS,
  nextPreviewDevice,
  type PreviewDevice,
} from "@/components/editor/preview-device";
import { PreviewRouteNav } from "@/components/editor/PreviewRouteNav";

export function PreviewDeviceCycleButton({
  device,
  onDeviceChange,
}: {
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
}) {
  const current = DEVICE_OPTIONS.find((option) => option.id === device) ?? DEVICE_OPTIONS[0];
  const Icon = current.icon;

  return (
    <button
      type="button"
      className="forge-preview-device-btn"
      data-active="true"
      title={current.label}
      aria-label={current.label}
      aria-pressed="true"
      onClick={() => onDeviceChange(nextPreviewDevice(device))}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

interface PreviewViewportChromeProps {
  files: Array<{ path: string; content?: string }>;
  activePath: string;
  onNavigate: (path: string) => void;
  devUrl?: string | null;
  onRefresh?: () => void;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
}

export function PreviewViewportChrome({
  files,
  activePath,
  onNavigate,
  devUrl,
  onRefresh,
  device,
  onDeviceChange,
}: PreviewViewportChromeProps) {
  return (
    <div className="forge-preview-chrome-bar">
      <div className="forge-preview-device-toggle" role="group" aria-label="Tamanho do preview">
        <PreviewDeviceCycleButton device={device} onDeviceChange={onDeviceChange} />
      </div>

      <div className="forge-preview-chrome-nav">
        <PreviewRouteNav
          variant="chrome"
          compact
          files={files}
          activePath={activePath}
          onNavigate={onNavigate}
          devUrl={devUrl}
        />
      </div>

      <button
        type="button"
        className="forge-preview-refresh-btn"
        title="Recarregar página"
        onClick={onRefresh}
        disabled={!onRefresh}
      >
        <RefreshCw className="size-3.5" />
      </button>
    </div>
  );
}
