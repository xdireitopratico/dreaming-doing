import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { ProviderSelector, type ProviderOption } from "@/components/editor/ProviderSelector";
import {
  type AgentPreferences,
  loadAgentPreferences,
  saveAgentPreferences,
} from "@/lib/agent-preferences";
import { normalizePresetId } from "@/lib/model-catalog";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

/** Seletor sempre visível no editor — ambiente/modelo não ficam escondidos no modo auto. */
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

  const configured = isAgentPreferencesConfigured(prefs);
  const presetId = configured
    ? prefs.mode === "robin"
      ? normalizePresetId(prefs.robinPoolModelId)
      : normalizePresetId(prefs.fixedPresetId)
    : "";

  const modeTag = !configured
    ? "setup"
    : prefs.mode === "robin"
      ? "pool"
      : prefs.mode === "auto"
        ? "auto"
        : "fixo";

  return (
    <div className="flex items-center gap-1.5 shrink-0 min-w-0">
      <ProviderSelector
        value={presetId}
        onChange={(opt: ProviderOption) => {
          const norm = normalizePresetId(opt.id);
          let next: AgentPreferences = { ...prefs };
          if (prefs.mode === "robin") {
            next = { ...next, robinPoolModelId: opt.id };
          } else if (prefs.mode === "auto") {
            const set = new Set((prefs.autoAllowedPresetIds ?? []).map(normalizePresetId));
            set.add(norm);
            next = { ...next, mode: "auto", autoAllowedPresetIds: [...set] };
          } else {
            next = { ...next, mode: "fixed", fixedPresetId: opt.id };
          }
          setPrefs(next);
          saveAgentPreferences(next);
        }}
        className="shrink-0 max-w-[140px]"
      />
      <Link
        to="/api"
        hash="forge-ai-studio"
        title={`Modo: ${modeTag} · voz: ${prefs.sttProvider ?? "groq"} — abrir Modelos`}
        className="forge-composer-chip shrink-0 px-2 py-1 gap-1 hover:border-[var(--primary)]/40"
      >
        <Settings2 className="size-3 opacity-70" />
        <span className="font-mono text-[9px] uppercase">{modeTag}</span>
      </Link>
    </div>
  );
}