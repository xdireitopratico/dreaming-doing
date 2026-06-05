import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { useConnectors } from "@/hooks/useConnectors";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { isAgentPreferencesConfigured } from "@/lib/agent-setup";
import { isConnectorActive, CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import type { ConnectorId } from "@/lib/connectors/integration-prefs";

type Props = {
  userMessageCount: number;
  onOpenConnector: (id: ConnectorId) => void;
  onStartProject?: () => void;
};

export function TasteSetupChecklist({ userMessageCount, onOpenConnector, onStartProject }: Props) {
  const { status, modes, tasteChatRemaining, tasteStartRemaining } = useConnectors();
  const prefs = loadAgentPreferences();
  const apiKeysDone = isAgentPreferencesConfigured(prefs);
  const vercelDone = isConnectorActive("vercel", modes.vercel, status.vercel);
  const githubDone = isConnectorActive("github", modes.github, status.github);
  const startDone = tasteStartRemaining < 1;

  const steps = [
    {
      id: "idea",
      label: "Contar sua ideia no chat",
      done: userMessageCount > 0,
      action: null as (() => void) | null,
    },
    {
      id: "start",
      label: "Start Project (demo agent-run + preview)",
      done: startDone,
      action: onStartProject && tasteStartRemaining > 0 ? onStartProject : null,
    },
    {
      id: "api",
      label: "API + Modelos — chaves e preset BYOK",
      done: apiKeysDone,
      action: () => {
        window.location.hash = "forge-ai-studio";
        document.getElementById("forge-ai-studio")?.scrollIntoView({ behavior: "smooth" });
      },
    },
    {
      id: "vercel",
      label: `Conectar ${CONNECTOR_REGISTRY.vercel.name} (deploy)`,
      done: vercelDone,
      action: () => onOpenConnector("vercel"),
    },
    {
      id: "github",
      label: `${CONNECTOR_REGISTRY.github.name} (opcional)`,
      done: githubDone,
      action: () => onOpenConnector("github"),
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const inTaste = tasteChatRemaining > 0 || tasteStartRemaining > 0;

  if (!inTaste && apiKeysDone) return null;

  return (
    <div
      id="forge-taste-checklist"
      className="mx-3 mb-2 rounded-lg border border-[var(--forge-primary)]/20 bg-[var(--forge-primary)]/5 px-3 py-2"
    >
      <div className="flex items-center gap-2 mb-2">
        <ListChecks className="size-3.5 text-[var(--forge-primary)]" />
        <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--forge-muted)]">
          Trilha Taste · {doneCount}/{steps.length}
        </span>
      </div>
      <ul className="space-y-1">
        {steps.map((step) => (
          <li key={step.id}>
            {step.action && !step.done ? (
              <button
                type="button"
                onClick={step.action}
                className="w-full flex items-center gap-2 rounded px-1 py-1 text-left hover:bg-[var(--forge-surface-3)] transition-colors"
              >
                <Circle className="size-3 text-[var(--forge-muted)] shrink-0" />
                <span className="font-mono text-[10px] text-[var(--forge-silver)]">{step.label}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-1 py-1">
                {step.done ? (
                  <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="size-3 text-[var(--forge-muted)] shrink-0" />
                )}
                <span className="font-mono text-[10px] text-[var(--forge-silver)]">{step.label}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Link
        to="/models"
        hash="forge-ai-studio"
        className="mt-2 inline-block font-mono text-[9px] text-[var(--forge-primary)] hover:underline"
      >
        Abrir Modelos →
      </Link>
    </div>
  );
}