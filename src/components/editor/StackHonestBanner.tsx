import { Smartphone, AlertTriangle } from "lucide-react";
import {
  detectProjectStack,
  stackKindLabel,
  type ProjectStackKind,
} from "@/lib/detect-project-kind";

type StackHonestBannerProps = {
  files: Array<{ path: string; content?: string }>;
  onFocusChat?: () => void;
};

const BANNER_KINDS = new Set<ProjectStackKind>(["android-native", "mixed"]);

export function StackHonestBanner({ files, onFocusChat }: StackHonestBannerProps) {
  const stack = detectProjectStack(files);
  if (!stack || !BANNER_KINDS.has(stack)) return null;

  const label = stackKindLabel(stack);

  return (
    <section
      className="forge-stack-honest-banner"
      data-testid="stack-honest-banner"
      role="status"
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-[var(--forge-foreground)]">
          {label} — preview web indisponível
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--forge-muted)] leading-relaxed">
          {stack === "mixed"
            ? "Este projeto mistura scaffold web e código mobile nativo. O iframe Vite não reflete o app Android — acompanhe o progresso no chat e na árvore de arquivos."
            : "Build nativo em andamento. Use a árvore de arquivos e o recibo no chat; preview iframe não se aplica a este stack."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {onFocusChat && (
            <button
              type="button"
              className="forge-stack-honest-action"
              onClick={onFocusChat}
            >
              Continuar build nativo
            </button>
          )}
          <span className="forge-stack-honest-hint inline-flex items-center gap-1">
            <Smartphone className="size-3 opacity-70" />
            Migrar para Expo (em breve)
          </span>
        </div>
      </div>
    </section>
  );
}