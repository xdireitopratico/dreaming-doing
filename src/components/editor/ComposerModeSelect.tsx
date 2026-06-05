import { Hammer, ListTodo, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AgentComposerMode } from "@/components/editor/ChatInput";
import {
  ForgeEditorDropdownContent,
  ForgeEditorDropdownItem,
} from "@/components/editor/ForgeEditorDropdown";

export function ComposerModeSelect({
  value,
  onChange,
}: {
  value: AgentComposerMode;
  onChange: (mode: AgentComposerMode) => void;
}) {
  const isBuild = value === "build";

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="forge-composer-mode-trigger"
          aria-label="Modo do agente"
        >
          {isBuild ? (
            <Hammer className="size-3.5 shrink-0 text-[var(--forge-primary)]" />
          ) : (
            <ListTodo className="size-3.5 shrink-0 text-[var(--forge-primary)]" />
          )}
          <span>{isBuild ? "Build" : "Plan"}</span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <ForgeEditorDropdownContent align="end" side="top" sideOffset={6} className="min-w-[120px]">
        <ForgeEditorDropdownItem
          className="font-mono text-[11px] focus:text-[var(--forge-primary)] data-[highlighted]:text-[var(--forge-primary)]"
          onSelect={() => onChange("build")}
        >
          <Hammer className="size-3.5 mr-2 text-[var(--forge-primary)]" />
          Build
        </ForgeEditorDropdownItem>
        <ForgeEditorDropdownItem
          className="font-mono text-[11px] focus:text-[var(--forge-primary)] data-[highlighted]:text-[var(--forge-primary)]"
          onSelect={() => onChange("plan")}
        >
          <ListTodo className="size-3.5 mr-2 text-[var(--forge-primary)]" />
          Plan
        </ForgeEditorDropdownItem>
      </ForgeEditorDropdownContent>
    </DropdownMenu>
  );
}