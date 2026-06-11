import { Copy, RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ROLLBACK_TOOLTIP =
  "Volta o chat e os arquivos do projeto ao estado anterior a esta mensagem. Remove este turno e tudo que veio depois.";

type ForgeMessageToolbarProps = {
  copyText: string;
  msgId: string;
  copied?: boolean;
  align?: "start" | "end";
  rollbackDisabled?: boolean;
  onCopy: (text: string, msgId: string) => void;
  onRollback?: () => void;
};

export function ForgeMessageToolbar({
  copyText,
  msgId,
  copied = false,
  align = "end",
  rollbackDisabled = false,
  onCopy,
  onRollback,
}: ForgeMessageToolbarProps) {
  if (!copyText.trim()) return null;

  return (
    <footer
      className={`forge-message-toolbar forge-message-toolbar--${align}`}
      data-testid="forge-message-toolbar"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onCopy(copyText, msgId)}
            className="forge-message-action"
            data-copied={copied}
            aria-label={copied ? "Copiado!" : "Copiar mensagem"}
          >
            <Copy className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Copiar</TooltipContent>
      </Tooltip>

      {onRollback && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onRollback}
              className="forge-message-action"
              disabled={rollbackDisabled}
              aria-label="Rollback"
              data-testid="forge-message-rollback"
            >
              <RotateCcw className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px] text-center">
            {ROLLBACK_TOOLTIP}
          </TooltipContent>
        </Tooltip>
      )}
    </footer>
  );
}
