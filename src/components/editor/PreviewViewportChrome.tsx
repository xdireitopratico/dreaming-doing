import { Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { PreviewRouteNav } from "@/components/editor/PreviewRouteNav";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

const DEVICE_OPTIONS: Array<{
  id: PreviewDevice;
  label: string;
  icon: typeof Monitor;
  width: string | null;
}> = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: null },
  { id: "tablet", label: "Tablet", icon: Tablet, width: "768px" },
  { id: "mobile", label: "Mobile", icon: Smartphone, width: "390px" },
];

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
        {DEVICE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = device === option.id;
          return (
            <button
              key={option.id}
              type="button"
              title={option.label}
              aria-pressed={active}
              className="forge-preview-device-btn"
              data-active={active}
              onClick={() => onDeviceChange(option.id)}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
      </div>

      <div className="forge-preview-chrome-nav">
        <PreviewRouteNav
          variant="chrome"
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

export function previewDeviceWidth(device: PreviewDevice): string | null {
  return DEVICE_OPTIONS.find((d) => d.id === device)?.width ?? null;
}