import { Check, Hammer, ListTodo, MessageCircle, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AgentComposerMode } from "@/components/editor/ChatInput";
import {
  ForgeEditorDropdownContent,
  ForgeEditorDropdownItem,
} from "@/components/editor/ForgeEditorDropdown";

/**
 * Fase 4.7: dropdown opt-in de modo do agente. 3 opções:
 *  - Chat (default): agente decide, sem gate, sem plano
 *  - Plan: agente propõe plano, usuário aprova/rejeita
 *  - Build: sinônimo de Plan no momento (UX)
 *
 * Sem defaults mágicos no servidor: o cliente envia `mode` no body e o
 * servidor decide se liga o planMode ou não. Sem isso, o agente fica
 * "trilhando" de gate em gate.
 */
export function ComposerModeSelect({
  value,
  onChange,
}: {
  value: AgentComposerMode;
  onChange: (mode: AgentComposerMode) => void;
}) {
  const opts: { key: AgentComposerMode; label: string; icon: typeof MessageCircle }[] = [
    { key: "chat", label: "Chat", icon: MessageCircle },
    { key: "plan", label: "Plan", icon: ListTodo },
    { key: "build", label: "Build", icon: Hammer },
  ];
  const current = opts.find((o) => o.key === value) ?? opts[0];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="forge-composer-mode-trigger"
          aria-label="Modo do agente"
        >
          <CurrentIcon className="size-3.5 shrink-0 text-[var(--forge-primary)]" />
          <span>{current.label}</span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <ForgeEditorDropdownContent align="end" side="top" sideOffset={6} className="min-w-[140px]">
        {opts.map(({ key, label, icon: Icon }) => {
          const isCurrent = key === value;
          return (
            <ForgeEditorDropdownItem
              key={key}
              className={`font-mono text-[11px] focus:text-[var(--forge-primary)] data-[highlighted]:text-[var(--forge-primary)] ${
                isCurrent ? "bg-[var(--forge-surface-2)] text-[var(--forge-primary)]" : ""
              }`}
              onSelect={() => onChange(key)}
            >
              <Icon className="size-3.5 mr-2 text-[var(--forge-primary)]" />
              {label}
              {isCurrent && <Check className="ml-auto size-3 text-[var(--forge-primary)]" />}
            </ForgeEditorDropdownItem>
          );
        })}
      </ForgeEditorDropdownContent>
    </DropdownMenu>
  );
}
