import { Link } from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import { useConnectors } from "@/hooks/useConnectors";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";

/** Após consumir o Start Project, convida o usuário ao BYOK. */
export function TastePostStartBanner() {
  const { tasteStartRemaining } = useConnectors();
  const byokReady = isAgentPreferencesConfigured(loadAgentPreferences());

  if (tasteStartRemaining > 0 || byokReady) return null;

  return (
    <div className="mx-3 mb-2 flex gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-3">
      <Rocket className="size-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="font-mono text-[10px] text-[var(--forge-silver)] leading-relaxed">
          Você já viu o <strong className="text-amber-300/90">Start Project</strong> com preview ao
          vivo. Para continuar construindo sem limite, configure <strong>suas</strong> API e
          modelos.
        </p>
        <span className="mt-2 flex flex-wrap gap-3">
          <Link
            to="/api"
            className="font-mono text-[10px] text-[var(--forge-primary)] hover:underline"
          >
            API →
          </Link>
          <Link
            to="/models"
            hash="forge-ai-studio"
            className="font-mono text-[10px] text-[var(--forge-primary)] hover:underline"
          >
            Modelos →
          </Link>
        </span>
      </div>
    </div>
  );
}
