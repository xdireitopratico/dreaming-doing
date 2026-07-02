import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ForgePopoverShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  widthClassName?: string;
  align?: "start" | "center" | "end";
};

/** Painel opaco padrão Forge — mesmo visual do ContextWindowIndicator. */
export function ForgePopoverShell({
  open,
  onOpenChange,
  trigger,
  children,
  widthClassName = "w-[180px]",
  align = "start",
}: ForgePopoverShellProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        side="top"
        sideOffset={8}
        className={cn(
          widthClassName,
          "border border-[var(--border-forge)]/70 bg-transparent p-0 shadow-none",
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="rounded-[11px] border border-[var(--forge-border-strong,rgba(237,239,242,0.14))] bg-[linear-gradient(135deg,#1a1e27,#0b0d12)] p-1 shadow-[0_12px_30px_rgba(0,0,0,0.38),0_0_0_1px_rgba(255,182,39,0.04)_inset] backdrop-blur-[18px] backdrop-saturate-[140%]">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}