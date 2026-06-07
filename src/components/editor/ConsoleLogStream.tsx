// ConsoleLogStream — Feed ao vivo de eventos do agente (fases, tools, erros)
// Aparece no ChatStream como um painel colapsável durante execução do agente.
// Inspiração: Claude Code CLI / Devin / Cursor Agent Mode.
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wrench,
  Brain,
  Eye,
  ListChecks,
  Check,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import type { SSEEvent } from "@/lib/agent-progress";

interface ConsoleLogStreamProps {
  /** Timeline de eventos do agente (Realtime / replay do DB) */
  timeline: SSEEvent[];
  /** Se true, força expandir (ex: quando agente inicia) */
  initiallyExpanded?: boolean;
  /** Máximo de linhas a mostrar (as mais antigas somem) */
  maxLines?: number;
  /** Callback para fechar o painel */
  onClose?: () => void;
}

const PHASE_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  gather: { label: "Lendo projeto", icon: ListChecks, color: "text-[var(--forge-primary)]" },
  classify: { label: "Classificando", icon: Brain, color: "text-[var(--forge-primary)]" },
  plan: { label: "Planejando", icon: Brain, color: "text-[var(--forge-primary)]" },
  execute: { label: "Executando", icon: Wrench, color: "text-[var(--forge-primary)]" },
  observe: { label: "Verificando build", icon: Eye, color: "text-amber-400" },
  summarize: { label: "Finalizando", icon: CheckCircle2, color: "text-emerald-400" },
  taste_chat: { label: "Concierge", icon: Brain, color: "text-[var(--forge-primary)]" },
  taste: { label: "Concierge", icon: Brain, color: "text-[var(--forge-primary)]" },
  done: { label: "Concluído", icon: CheckCircle2, color: "text-emerald-400" },
};

type LogLine = {
  id: string;
  kind: "phase" | "tool_start" | "tool_done" | "ok" | "fail" | "info" | "error" | "memory";
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  detail?: string;
  ts: number;
};

function buildLines(timeline: SSEEvent[]): LogLine[] {
  const lines: LogLine[] = [];
  for (const ev of timeline) {
    const ts = ev.timestamp;
    const data = ev.data ?? {};
    switch (ev.type) {
      case "phase": {
        const phase = String(data.phase ?? "");
        const meta = PHASE_META[phase] ?? {
          label: phase || "Trabalhando",
          icon: Brain,
          color: "text-[var(--forge-muted)]",
        };
        lines.push({
          id: `${ev.type}-${ts}-${lines.length}`,
          kind: "phase",
          icon: meta.icon,
          text: meta.label,
          detail: typeof data.message === "string" ? data.message : undefined,
          ts,
        });
        break;
      }
      case "tool_start": {
        const name = String(data.name ?? "?");
        const args = data.args as Record<string, unknown> | undefined;
        let detail = "";
        if (args && typeof args === "object") {
          const path = (args.path ?? args.filePath ?? args.file) as string | undefined;
          const command = (args.command ?? args.cmd) as string | undefined;
          if (path) detail = path;
          else if (command) detail = command.length > 80 ? command.slice(0, 80) + "…" : command;
          else if (args.query) detail = String(args.query).slice(0, 80);
        }
        lines.push({
          id: `${ev.type}-${ts}-${lines.length}`,
          kind: "tool_start",
          icon: Wrench,
          text: name,
          detail,
          ts,
        });
        break;
      }
      case "tool_done": {
        const name = String(data.name ?? "?");
        const ok = data.ok === true;
        lines.push({
          id: `${ev.type}-${ts}-${lines.length}`,
          kind: ok ? "ok" : "error",
          icon: ok ? Check : AlertCircle,
          text: name,
          detail: !ok && typeof data.error === "string" ? data.error : undefined,
          ts,
        });
        break;
      }
      case "validate_ok":
        lines.push({
          id: `${ev.type}-${ts}-${lines.length}`,
          kind: "ok",
          icon: Check,
          text: "Validação OK",
          detail: typeof data.message === "string" ? data.message : undefined,
          ts,
        });
        break;
      case "validate_fail":
        lines.push({
          id: `${ev.type}-${ts}-${lines.length}`,
          kind: "fail",
          icon: AlertCircle,
          text: "Validação falhou",
          detail: typeof data.message === "string" ? data.message : undefined,
          ts,
        });
        break;
      case "memory":
      case "context_pressure":
      case "context_compress":
      case "rate_limit":
      case "robin_rotate":
      case "connection_retry":
        if (typeof data.message === "string") {
          lines.push({
            id: `${ev.type}-${ts}-${lines.length}`,
            kind: "info",
            icon: Loader2,
            text: data.message,
            ts,
          });
        }
        break;
      case "error":
        lines.push({
          id: `${ev.type}-${ts}-${lines.length}`,
          kind: "error",
          icon: AlertCircle,
          text: typeof data.message === "string" ? data.message : "Erro do agente",
          ts,
        });
        break;
    }
  }
  return lines;
}

export function ConsoleLogStream({
  timeline,
  initiallyExpanded = false,
  maxLines = 80,
  onClose,
}: ConsoleLogStreamProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const lines = buildLines(timeline);
  const visible = lines.slice(-maxLines);
  const lastPhase = [...visible].reverse().find((l) => l.kind === "phase");
  const hasError = visible.some((l) => l.kind === "error" || l.kind === "fail");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [expanded, visible.length]);

  // Auto-expand na primeira fase "execute" / primeiro tool
  useEffect(() => {
    if (initiallyExpanded) return;
    if (visible.some((l) => l.kind === "tool_start" || l.kind === "fail" || l.kind === "error")) {
      setExpanded(true);
    }
  }, [visible.length, initiallyExpanded]);

  if (lines.length === 0) return null;

  return (
    <div
      className={`mx-3 mb-2 rounded-lg border overflow-hidden transition-all
        ${hasError
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-[var(--forge-border)] bg-[var(--forge-surface-2)]/40"
        }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--forge-surface-3)]/40 transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Terminal className="size-3 text-[var(--forge-primary)] shrink-0" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--forge-muted)] shrink-0">
            Console · {visible.length}
          </span>
          {lastPhase && !expanded && (
            <span className="font-mono text-[10px] text-[var(--forge-silver)] truncate min-w-0 flex items-center gap-1.5">
              <lastPhase.icon className={`size-3 ${PHASE_META[lastPhase.text.toLowerCase().replace(/\s+/g, "_")]?.color ?? "text-[var(--forge-muted)]"} shrink-0`} />
              <span className="truncate">{lastPhase.text}</span>
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {onClose && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }
              }}
              className="grid size-5 place-items-center rounded text-[var(--forge-muted)] hover:text-[var(--forge-text)] hover:bg-[var(--forge-surface-3)]/60"
              aria-label="Fechar console"
            >
              <X className="size-3" />
            </span>
          )}
          {expanded ? (
            <ChevronUp className="size-3 text-[var(--forge-muted)]" />
          ) : (
            <ChevronDown className="size-3 text-[var(--forge-muted)]" />
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="console-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div
              ref={scrollRef}
              className="max-h-48 overflow-y-auto px-3 py-2 font-mono text-[10px] leading-relaxed border-t border-[var(--forge-border)]/60"
            >
              {visible.map((line) => {
                const colorClass =
                  line.kind === "error" || line.kind === "fail"
                    ? "text-amber-400"
                    : line.kind === "ok"
                      ? "text-emerald-400"
                      : line.kind === "phase"
                        ? "text-[var(--forge-silver)]"
                        : line.kind === "tool_start"
                          ? "text-[var(--forge-text)]"
                          : "text-[var(--forge-muted)]";
                return (
                  <div key={line.id} className="flex items-start gap-2 py-0.5">
                    <span className="text-[9px] text-[var(--forge-muted)] shrink-0 w-12 tabular-nums">
                      {new Date(line.ts).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <line.icon className={`size-3 shrink-0 mt-0.5 ${colorClass}`} />
                    <span className="shrink-0 font-medium">
                      {line.text}
                    </span>
                    {line.detail && (
                      <span className="text-[var(--forge-muted)] truncate min-w-0">
                        · {line.detail}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
