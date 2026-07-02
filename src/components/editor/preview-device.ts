import { Monitor, Smartphone, Tablet } from "lucide-react";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

export const PREVIEW_DEVICE_OPTIONS: Array<{
  id: PreviewDevice;
  label: string;
  icon: typeof Monitor;
  width: string | null;
}> = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: null },
  { id: "tablet", label: "Tablet", icon: Tablet, width: "768px" },
  { id: "mobile", label: "Mobile", icon: Smartphone, width: "390px" },
];

const PREVIEW_DEVICE_ORDER: PreviewDevice[] = PREVIEW_DEVICE_OPTIONS.map((option) => option.id);

export function nextPreviewDevice(device: PreviewDevice): PreviewDevice {
  const currentIndex = PREVIEW_DEVICE_ORDER.indexOf(device);
  if (currentIndex < 0) return PREVIEW_DEVICE_ORDER[0] ?? "desktop";
  return PREVIEW_DEVICE_ORDER[(currentIndex + 1) % PREVIEW_DEVICE_ORDER.length] ?? "desktop";
}

export function previewDeviceWidth(device: PreviewDevice): string | null {
  return PREVIEW_DEVICE_OPTIONS.find((option) => option.id === device)?.width ?? null;
}
