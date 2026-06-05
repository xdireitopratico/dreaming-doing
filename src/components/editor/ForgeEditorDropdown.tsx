import type { ComponentPropsWithoutRef } from "react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function ForgeEditorDropdownContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      className={cn(
        "forge-dropdown-panel z-[200] border-[var(--forge-border-strong)] bg-[var(--forge-surface-3)] p-1 text-[var(--forge-text)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]",
        className,
      )}
      {...props}
    />
  );
}

export function ForgeEditorDropdownItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuItem>) {
  return (
    <DropdownMenuItem
      className={cn(
        "forge-dropdown-item cursor-pointer rounded-md text-[var(--forge-silver)] focus:bg-[var(--forge-surface-3)] focus:text-[var(--forge-text)] data-[highlighted]:bg-[var(--forge-surface-3)] data-[highlighted]:text-[var(--forge-text)]",
        className,
      )}
      {...props}
    />
  );
}