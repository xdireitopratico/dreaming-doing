import { Check, Hammer, ListTodo } from "lucide-react";
import {
  ForgeEditorDropdownContent,
  ForgeEditorDropdownItem,
} from "@/components/editor/ForgeEditorDropdown";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AgentComposerMode } from "@/lib/chat-types";

/**
 * Modos estilo Lovable (docs.lovable.dev/features/plan-mode + agent-mode).
 *  - Plan: pensar, perguntar, propor plano — sem mexer no código.
 *  - Build: implementar direto quando o pedido for claro.
 */
export function ComposerModeSelect({
  value,
  onChange,
}: {
  value: AgentComposerMode;
  onChange: (mode: AgentComposerMode) => void;
}) {
  const opts: { key: AgentComposerMode; label: string; icon: typeof ListTodo }[] = [
    { key: "plan", label: "Plan", icon: ListTodo },
    { key: "build", label: "Build", icon: Hammer },
  ];
  const current = opts.find((o) => o.key === value) ?? opts[0];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="forge-composer-mode-trigger" aria-label="Modo do agente">
          <CurrentIcon className="size-3.5 shrink-0" />
          <span>{current.label}</span>
        </button>
      </DropdownMenuTrigger>
      <ForgeEditorDropdownContent align="end" side="top" sideOffset={6} className="min-w-[120px]">
        {opts.map(({ key, label, icon: Icon }) => {
          const isCurrent = key === value;
          return (
            <ForgeEditorDropdownItem
              key={key}
              className={`font-mono text-[11px] ${isCurrent ? "font-semibold" : ""}`}
              onSelect={() => onChange(key)}
            >
              <Icon className="size-3.5 mr-2" />
              {label}
              {isCurrent && <Check className="ml-auto size-3" />}
            </ForgeEditorDropdownItem>
          );
        })}
      </ForgeEditorDropdownContent>
    </DropdownMenu>
  );
}
