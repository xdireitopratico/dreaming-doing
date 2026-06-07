// AgentTimeline — trilha vertical compacta de fases e tools do agente
import { useMemo } from "react";
import {
  Brain,
  Check,
  CheckCircle2,
  Eye,
  ListChecks,
  Loader2,
  Wrench,
  X,
} from "lucide-react";
import type { SSEEvent } from "@/lib/agent-progress";

type TimelineStep = {
  id: string;
  label: string;
  detail?: string;
  status: "done" | "active" | "error" | "pending";
  icon: React.ComponentType<{ className?: string }>;
};

const PHASE_LABELS: Record<string, string> = {
  gather: "Analisando projeto",
  classify: "Classificando",
  plan: "Planejando",
  execute: "Gerando código",
  observe: "Verificando build",
  summarize: "Finalizando",
  taste: "Concierge",
  taste_chat: "Concierge",
  done: "Concluído",
};

function buildSteps(timeline: SSEEvent[], running: boolean): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const toolStatus = new Map<string, "active" | "done" | "error">();

  for (const ev of timeline) {
    const data = ev.data ?? {};
    if (ev.type === "phase") {
      const phase = String(data.phase ?? "");
      steps.push({
        id: `phase-${ev.timestamp}-${steps.length}`,
        label: (PHASE_LABELS[phase] ?? phase) || "Trabalhando",
        detail: typeof data.message === "string" ? data.message : undefined,
        status: "done",
        icon: phase === "observe" ? Eye : phase === "execute" ? Wrench : Brain,
      });
    }
    if (ev.type === "tool_start") {
      const name = String(data.name ?? "tool");
      const key = `${name}-${steps.length}`;
      toolStatus.set(key, "active");
      steps.push({
        id: `tool-${ev.timestamp}-${steps.length}`,
        label: name,
        detail: typeof data.args === "object" && data.args
          ? String((data.args as Record<string, unknown>).path ?? (data.args as Record<string, unknown>).command ?? "").slice(0, 64)
          : undefined,
        status: "active",
        icon: Wrench,
      });
    }
    if (ev.type === "tool_done") {
      const name = String(data.name ?? "tool");
      const ok = data.ok === true;
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].label === name && steps[i].status === "active") {
          steps[i] = {
            ...steps[i],
            status: ok ? "done" : "error",
            detail: !ok && typeof data.error === "string" ? data.error.slice(0, 80) : steps[i].detail,
            icon: ok ? Check : X,
          };
          break;
        }
      }
    }
  }

  if (running && steps.length > 0) {
    const last = steps[steps.length - 1];
    if (last.status === "done") {
      steps.push({
        id: "active-next",
        label: "Em andamento…",
        status: "active",
        icon: Loader2,
      });
    } else if (last.status === "active") {
      steps[steps.length - 1] = { ...last, status: "active", icon: Loader2 };
    }
  }

  return steps.slice(-12);
}

interface AgentTimelineProps {
  timeline: SSEEvent[];
  running?: boolean;
}

export function AgentTimeline({ timeline, running = false }: AgentTimelineProps) {
  const steps = useMemo(() => buildSteps(timeline, running), [timeline, running]);
  if (steps.length === 0) return null;

  return (
    <section
      className="my-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2"
      aria-label="Timeline do agente"
      data-testid="agent-timeline"
    >
      <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--forge-ghost)] mb-2">
        Timeline
      </p>
      <ol className="space-y-1.5">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2 min-w-0">
            <span className="mt-0.5 shrink-0">
              {step.status === "active" ? (
                <Loader2 className="size-3.5 animate-spin text-[var(--forge-primary)]" />
              ) : step.status === "error" ? (
                <X className="size-3.5 text-amber-400" />
              ) : step.status === "done" ? (
                <CheckCircle2 className="size-3.5 text-emerald-400/90" />
              ) : (
                <ListChecks className="size-3.5 text-[var(--forge-muted)]" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] text-[var(--forge-silver)] truncate">{step.label}</p>
              {step.detail && (
                <p className="font-mono text-[9px] text-[var(--forge-ghost)] truncate">{step.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}