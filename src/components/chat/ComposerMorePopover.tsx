import { useEffect, useState } from "react";
import { FileText, ImageIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ForgePopoverShell } from "@/components/chat/ForgePopoverShell";
import { HotlOperationControl } from "@/components/chat/HotlOperationControl";
import { loadAgentPreferences } from "@/lib/agent-preferences";

type ComposerMorePopoverProps = {
  onAttachFiles: () => void;
  disabled?: boolean;
};

export function ComposerMorePopover({ onAttachFiles, disabled }: ComposerMorePopoverProps) {
  const [open, setOpen] = useState(false);
  const [hotlActive, setHotlActive] = useState(
    () => loadAgentPreferences().operation?.mode === "hotl",
  );

  useEffect(() => {
    if (open) {
      setHotlActive(loadAgentPreferences().operation?.mode === "hotl");
    }
  }, [open]);

  return (
    <ForgePopoverShell
      open={open}
      onOpenChange={setOpen}
      widthClassName="w-[196px]"
      trigger={
        <button
          type="button"
          className={cn(
            "forge-composer-add relative",
            hotlActive && "text-[var(--text-accent)]",
          )}
          title="Mais opções"
          aria-label="Mais opções"
          disabled={disabled}
        >
          <Plus className="size-4" />
          {hotlActive && (
            <span
              className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-[var(--text-accent)]"
              aria-hidden
            />
          )}
        </button>
      }
    >
      <div className="grid gap-[3px] p-0.5">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-[rgba(237,239,242,0.08)] bg-[rgba(255,255,255,0.03)] px-1.5 py-1 text-left transition-colors hover:border-[var(--border-active)]"
          onClick={() => {
            onAttachFiles();
            setOpen(false);
          }}
        >
          <span className="grid size-5 place-items-center rounded-md border border-[var(--border-forge)] bg-[var(--bg-base)]">
            <ImageIcon className="size-3 text-[var(--text-secondary)]" />
          </span>
          <span className="min-w-0">
            <span className="block text-[8px] font-semibold text-[var(--text-primary)]">
              Anexar arquivo
            </span>
            <span className="block text-[7px] text-[var(--text-muted)]">Imagem ou documento</span>
          </span>
          <FileText className="ml-auto size-3 shrink-0 text-[var(--text-muted)]" aria-hidden />
        </button>

        <HotlOperationControl onUpdated={(prefs) => setHotlActive(prefs.mode === "hotl")} />
      </div>
    </ForgePopoverShell>
  );
}