import { useEffect, useMemo, useState } from "react";
import { FileEdit, FilePlus, Loader2 } from "lucide-react";
import type { AgentProgress } from "@/lib/agent-progress";
import { buildAgentNarrative } from "@/lib/agent-narrative";
import { getShortToolLabel } from "@/lib/tool-labels";
import { pickChatResponseTip } from "@/lib/chat-response-tips";

type AgentActivityCardProps = {
  progress: AgentProgress;
  isActive: boolean;
  persistedText?: string | null;
};

function fileBase(path: string): string {
  const p = path.replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function collectActivityFiles(progress: AgentProgress): string[] {
  const paths = new Set<string>();
  for (const d of progress.diffs) {
    if (d.path) paths.add(d.path);
  }
  for (const t of progress.tools) {
    if ((t.name === "fs_write" || t.name === "fs_edit") && t.args?.path) {
      paths.add(String(t.args.path));
    }
  }
  return [...paths].slice(-10);
}

export function AgentActivityCard({
  progress,
  isActive,
  persistedText,
}: AgentActivityCardProps) {
  const [tipSeed, setTipSeed] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => setTipSeed((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, [isActive]);

  const narrative = buildAgentNarrative(progress, { running: isActive, persistedText });
  const files = useMemo(() => collectActivityFiles(progress), [progress.diffs, progress.tools]);
  const activeTool = progress.tools.filter((t) => t.ok === undefined).at(-1);
  const showTip = isActive && !narrative.body && !files.length;
  const tip = showTip ? pickChatResponseTip(tipSeed) : null;

  const statusLine =
    narrative.headline ??
    (isActive ? "Trabalhando no seu pedido…" : null);

  const doneFileCount = progress.diffs.length;
  const showSummary = !isActive && doneFileCount > 0 && !narrative.body?.includes("arquivo");

  const showReceipt =
    !isActive &&
    progress.finished &&
    ((progress.currentStep != null && progress.totalSteps != null) ||
      (progress.deliveryFiles?.length ?? 0) > 0 ||
      progress.resumable);

  if (!isActive && !files.length && !showSummary && !progress.skills.length && !showReceipt) {
    return null;
  }

  return (
    <section
      className="lovable-activity-card"
      data-testid="agent-activity-card"
      aria-live={isActive ? "polite" : undefined}
    >
      {isActive && statusLine && (
        <div className="lovable-activity-status" data-testid="agent-activity-status">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--forge-primary)]" />
          <span className="lovable-activity-status-text">{statusLine}</span>
        </div>
      )}

      {activeTool && isActive && (
        <p className="lovable-activity-sub">
          {getShortToolLabel(activeTool.name)}
          {activeTool.args?.path ? ` · ${fileBase(String(activeTool.args.path))}` : ""}
        </p>
      )}

      {files.length > 0 && (
        <ul className="lovable-activity-files" aria-label="Arquivos em edição">
          {files.map((path) => {
            const isWrite = progress.diffs.some(
              (d) => d.path === path && d.op === "write",
            );
            const Icon = isWrite ? FilePlus : FileEdit;
            return (
              <li key={path} className="lovable-file-chip">
                <Icon className="size-3 shrink-0 opacity-70" />
                <span className="truncate max-w-[200px]" title={path}>
                  {fileBase(path)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {showSummary && (
        <p className="lovable-activity-summary">
          {doneFileCount === 1
            ? "1 arquivo alterado"
            : `${doneFileCount} arquivos alterados`}
        </p>
      )}

      {progress.skills.length > 0 && (
        <ul className="lovable-activity-skills" aria-label="Skills ativas">
          {progress.skills.slice(-4).map((s) => (
            <li key={s} className="lovable-skill-chip">
              {s}
            </li>
          ))}
        </ul>
      )}

      {tip && <p className="lovable-activity-tip">{tip}</p>}

      {narrative.subhint && isActive && (
        <p className="lovable-activity-subhint">{narrative.subhint}</p>
      )}
    </section>
  );
}