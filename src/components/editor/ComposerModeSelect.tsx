import { Hammer, ListTodo, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AgentComposerMode } from "@/components/editor/ChatInput";

export function ComposerModeSelect({
  value,
  onChange,
}: {
  value: AgentComposerMode;
  onChange: (mode: AgentComposerMode) => void;
}) {
  const isBuild = value === "build";

  return (
    <DropdownMenu>
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
          <span>{isBuild ? "Build" : "Play"}</span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={6}
        className="forge-dropdown-panel z-[200] min-w-[120px] border-[var(--forge-border-strong)] !bg-[var(--forge-surface-2)] p-1 !text-[var(--forge-text)]"
      >
        <DropdownMenuItem
          className="forge-dropdown-item font-mono text-[11px] focus:bg-[var(--forge-surface-3)] focus:text-[var(--forge-primary)]"
          onClick={() => onChange("build")}
        >
          <Hammer className="size-3.5 mr-2 text-[var(--forge-primary)]" />
          Build
        </DropdownMenuItem>
        <DropdownMenuItem
          className="forge-dropdown-item font-mono text-[11px] focus:bg-[var(--forge-surface-3)] focus:text-[var(--forge-primary)]"
          onClick={() => onChange("plan")}
        >
          <ListTodo className="size-3.5 mr-2 text-[var(--forge-primary)]" />
          Play
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}