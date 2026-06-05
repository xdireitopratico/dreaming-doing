import type { ConnectorId } from "@/lib/connectors/integration-prefs";

export type TasteUiAction =
  | { action: "open_connector"; connector: ConnectorId; reason?: string }
  | {
      action: "navigate_setup";
      step: "api" | "api-keys" | "models" | "connectors" | "auth";
      hash?: string;
      connector?: string;
    }
  | { action: "lead_saved"; email: string }
  | { action: "highlight_setup"; stepId: string };

export const TASTE_UI_EVENT = "forge:ui-action";

export function dispatchTasteUiAction(detail: TasteUiAction) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TASTE_UI_EVENT, { detail }));
}

export function isTasteUiAction(raw: unknown): raw is TasteUiAction {
  if (!raw || typeof raw !== "object") return false;
  const a = (raw as { action?: string }).action;
  return (
    a === "open_connector" ||
    a === "navigate_setup" ||
    a === "lead_saved" ||
    a === "highlight_setup"
  );
}