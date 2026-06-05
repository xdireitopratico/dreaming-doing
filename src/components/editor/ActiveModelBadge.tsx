import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  type AgentPreferences,
  loadAgentPreferences,
} from "@/lib/agent-preferences";
import { getPresetById, normalizePresetId } from "@/lib/model-catalog";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

function modelLabel(prefs: AgentPreferences): string {
  if (!isAgentPreferencesConfigured(prefs)) return "configurar";
  if (prefs.mode === "auto") return "auto";
  const id =
    prefs.mode === "robin"
      ? normalizePresetId(prefs.robinPoolModelId)
      : normalizePresetId(prefs.fixedPresetId);
  return getPresetById(id).label;
}

/** Modelo ativo — só leitura; edição completa em /models. */
export function ActiveModelBadge({ className = "" }: { className?: string }) {
  const [prefs, setPrefs] = useState(() => loadAgentPreferences());

  const refresh = useCallback(() => setPrefs(loadAgentPreferences()), []);

  useEffect(() => {
    window.addEventListener("forge:prefs-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("forge:prefs-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  const label = modelLabel(prefs);

  return (
    <Link
      to="/models"
      title="Abrir Modelos — ranking completo e pool ROBIN"
      className={`inline-flex items-center gap-1 rounded-md border border-[var(--forge-border)] bg-[var(--forge-surface-3)]/80 px-2 py-0.5 font-mono text-[9px] text-[var(--forge-silver)] hover:border-[var(--forge-primary)]/35 hover:text-[var(--forge-text)] transition-colors ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[var(--forge-ghost)]">modelo</span>
      <span className="truncate max-w-[100px] text-[var(--forge-primary)]">{label}</span>
    </Link>
  );
}