/**
 * PrometheusThemeToggle — botão Sun/Moon para alternar entre Tema A (Vibecoding)
 * e Tema B (legacy Deep Blue).
 *
 * Pode ser renderizado em qualquer lugar dentro de .prometheus-studio.
 * Lê/escreve em localStorage["prometheus-editor-theme"].
 */
import { Moon, Sun } from "lucide-react";
import { usePrometheusEditorTheme } from "@/lib/prometheus-editor-theme";

export function PrometheusThemeToggle() {
  const { theme, toggle } = usePrometheusEditorTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
      style={{
        background: "transparent",
        color: "var(--ps-cream-60)",
      }}
      title={theme === "default" ? "Trocar para tema legacy" : "Trocar para tema padrão (Vibecoding)"}
      aria-label="Alternar tema do editor"
      data-testid="prometheus-theme-toggle"
      data-theme-current={theme}
    >
      {theme === "default" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
    </button>
  );
}
