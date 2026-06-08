import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { TASTE_UI_EVENT, isTasteUiAction } from "@/lib/taste-ui-actions";

export const OPEN_CONNECTOR_EVENT = "forge:open-connector";

export function useTasteUiActions() {
  const navigate = useNavigate();

  useEffect(() => {
    const onAction = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (!isTasteUiAction(detail)) return;

      switch (detail.action) {
        case "open_connector": {
          if (detail.connector === "e2b") {
            void navigate({ to: "/api", hash: "forge-key-e2b" });
            break;
          }
          window.dispatchEvent(
            new CustomEvent(OPEN_CONNECTOR_EVENT, {
              detail: { connector: detail.connector, reason: detail.reason },
            }),
          );
          break;
        }
        case "navigate_setup": {
          if (detail.step === "auth") {
            void navigate({ to: "/auth" });
            break;
          }
          if (detail.step === "connectors") {
            void navigate({ to: "/connectors" });
            break;
          }
          if (detail.step === "models") {
            void navigate({ to: "/models", hash: detail.hash ?? "forge-ai-studio" });
            break;
          }
          const hash =
            detail.hash ??
            (detail.connector ? `forge-key-${detail.connector}` : undefined);
          void navigate({ to: "/api", hash });
          break;
        }
        case "lead_saved":
          break;
        case "highlight_setup":
          document
            .getElementById("forge-taste-checklist")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          break;
        default:
          break;
      }
    };

    window.addEventListener(TASTE_UI_EVENT, onAction);
    return () => window.removeEventListener(TASTE_UI_EVENT, onAction);
  }, [navigate]);
}