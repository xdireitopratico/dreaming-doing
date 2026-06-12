import { FileCode, Terminal } from "lucide-react";
import type { AgentProgress } from "@/lib/agent-progress";
import {
  collectBuildLogLines,
  collectNativeProjectFiles,
  collectShellCommands,
} from "@/lib/native-build-console";
import { stackKindLabel, type ProjectStackKind } from "@/lib/detect-project-kind";

type BuildConsoleProps = {
  files: Array<{ path: string; content?: string }>;
  progress?: AgentProgress | null;
  stackKind: ProjectStackKind;
  agentRunning?: boolean;
  onFocusChat?: () => void;
};

function fileBase(path: string): string {
  const p = path.replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

export function BuildConsole({
  files,
  progress,
  stackKind,
  agentRunning = false,
  onFocusChat,
}: BuildConsoleProps) {
  const nativeFiles = collectNativeProjectFiles(files);
  const logLines = collectBuildLogLines(progress ?? null);
  const shellHistory = collectShellCommands(progress ?? null);
  const fork = progress?.stackForkSuggested ?? null;
  const step = null;

  return (
    <div className="forge-build-console" data-testid="build-console">
      <header className="forge-build-console-header">
        <Terminal className="size-4 shrink-0 text-[var(--forge-primary)]" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--forge-foreground)]">
            {stackKindLabel(stackKind)}
          </p>
          <p className="text-[11px] text-[var(--forge-muted)]">
            Projeto só Android — acompanhe arquivos e logs de build aqui.
          </p>
        </div>
        {step && (
          <span className="forge-build-console-step" data-testid="build-console-step">
            {step}
          </span>
        )}
      </header>

      {fork && (
        <section className="forge-build-console-fork" data-testid="stack-fork-suggested">
          <p className="text-[12px] text-[var(--forge-foreground)] leading-relaxed">
            {fork.message}
          </p>
          <p className="mt-1 text-[11px] text-[var(--forge-muted)]">
            Arquivo detectado: <code className="font-mono">{fork.path}</code>
          </p>
          {onFocusChat && (
            <button type="button" className="forge-stack-honest-action mt-2" onClick={onFocusChat}>
              Criar projeto Android dedicado
            </button>
          )}
        </section>
      )}

      <section className="forge-build-console-section">
        <h3 className="forge-build-console-label">
          <FileCode className="size-3.5" />
          Arquivos nativos ({nativeFiles.length})
        </h3>
        {nativeFiles.length > 0 ? (
          <ul className="forge-build-console-files">
            {nativeFiles.map((path) => (
              <li key={path} title={path}>
                {fileBase(path)}
                <span className="forge-build-console-file-path">{path}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="forge-build-console-empty">
            Nenhum arquivo Gradle/Kotlin ainda — o agente vai criar conforme avança.
          </p>
        )}
      </section>

      <section className="forge-build-console-section forge-build-console-log">
        <h3 className="forge-build-console-label">
          <Terminal className="size-3.5" />
          Build log
        </h3>
        {agentRunning && logLines.length === 0 && (
          <p className="forge-build-console-empty">Aguardando ./gradlew assembleDebug…</p>
        )}
        {shellHistory.length > 0 && (
          <div className="forge-build-console-commands">
            {shellHistory.map((cmd, i) => (
              <div
                key={`${cmd.slice(0, 24)}-${i}`}
                className="font-mono text-[10px] text-[var(--forge-ghost)]"
              >
                $ {cmd}
              </div>
            ))}
          </div>
        )}
        {logLines.length > 0 ? (
          <pre className="forge-build-console-pre" data-testid="build-console-log">
            {logLines.map((entry, i) => (
              <div
                key={`${entry.ts}-${i}`}
                className={entry.ok ? "text-[var(--forge-silver)]" : "text-amber-300/90"}
              >
                {entry.line}
              </div>
            ))}
          </pre>
        ) : !agentRunning ? (
          <p className="forge-build-console-empty">
            Logs aparecem quando o agente rodar Gradle no sandbox.
          </p>
        ) : null}
      </section>
    </div>
  );
}
