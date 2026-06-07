import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Github, Hammer, MessageSquare } from "lucide-react";

interface PreviewEmptyGuideProps {
  projectName?: string;
  e2bConnected: boolean;
  agentHasRun: boolean;
  onOpenPreview?: () => void;
  onImportRepo?: (repoUrl: string) => void;
  onFocusChat?: () => void;
}

export function PreviewEmptyGuide({
  projectName,
  e2bConnected,
  agentHasRun,
  onOpenPreview,
  onImportRepo,
  onFocusChat,
}: PreviewEmptyGuideProps) {
  const [repo, setRepo] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = repo.trim();
    if (!url) return;
    onImportRepo?.(url);
  };

  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-6 bg-white p-8 text-center forge-preview-empty-single">
      <div className="grid size-14 place-items-center rounded-2xl bg-neutral-900 text-[var(--forge-primary)]">
        <Hammer className="size-7" strokeWidth={1.5} />
      </div>

      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-semibold text-neutral-900">
          {projectName ? <>Vamos construir <strong>{projectName}</strong></> : <>Seu projeto aparecerá aqui</>}
        </h2>
        <p className="text-sm text-neutral-500 leading-relaxed">
          Cole a URL de um repositório GitHub para importar, ou descreva sua ideia no chat
          para o agente começar.
        </p>
      </div>

      <p className="text-xs font-bold tracking-[0.15em] uppercase text-neutral-300">Let's Build</p>

      <form onSubmit={submit} className="w-full max-w-md flex items-center gap-2">
        <div className="relative flex-1">
          <Github className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
          <input
            type="url"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="https://github.com/user/repo"
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300"
          />
        </div>
        <button
          type="submit"
          disabled={!repo.trim() || !onImportRepo}
          className="h-10 px-4 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          Importar
          <ArrowRight className="size-3.5" />
        </button>
      </form>

      <button
        type="button"
        onClick={onFocusChat}
        className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
      >
        <MessageSquare className="size-4" />
        Ou descreva sua ideia no chat
      </button>

      {!e2bConnected && (
        <p className="text-xs text-amber-800/90 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 max-w-md">
          Configure a chave E2B em{" "}
          <Link to="/api" className="underline font-medium">API Keys</Link>{" "}
          para habilitar o sandbox de preview ao vivo.
        </p>
      )}

      {onOpenPreview && e2bConnected && agentHasRun && (
        <button
          type="button"
          onClick={onOpenPreview}
          className="text-xs text-neutral-500 underline-offset-4 hover:underline"
        >
          Reconectar preview agora
        </button>
      )}
    </div>
  );
}
