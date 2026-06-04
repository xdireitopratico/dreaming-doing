import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { ProviderSelector, type ProviderOption } from "@/components/editor/ProviderSelector";
import {
  type AgentPreferences,
  agentModeLabel,
  loadAgentPreferences,
  saveAgentPreferences,
} from "@/lib/agent-preferences";

/** Seletor de modelo no editor — sincronizado com /api-keys (potência). */
export function EditorModelControl() {
  const [prefs, setPrefs] = useState<AgentPreferences>(() => loadAgentPreferences());

  const refresh = useCallback(() => setPrefs(loadAgentPreferences()), []);

  useEffect(() => {
    window.addEventListener("forge:prefs-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("forge:prefs-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  if (prefs.mode === "fixed") {
    return (
      <ProviderSelector
        value={prefs.fixedPresetId ?? "anthropic-sonnet"}
        onChange={(opt: ProviderOption) => {
          const next = { ...prefs, fixedPresetId: opt.id };
          setPrefs(next);
          saveAgentPreferences(next);
        }}
        className="shrink-0"
      />
    );
  }

  const label = agentModeLabel(prefs);

  return (
    <Link
      to="/api-keys"
      title="Modelo e potência — configurar em API Keys"
      className="forge-composer-chip max-w-[160px] truncate hover:border-[var(--primary)]/40 transition-colors"
    >
      <Settings2 className="size-3 shrink-0 opacity-70" />
      <span className="truncate">{label}</span>
    </Link>
  );
}