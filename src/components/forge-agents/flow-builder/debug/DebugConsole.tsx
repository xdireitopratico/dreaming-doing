/**
 * DebugConsole — Console log viewer tab
 */
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Terminal, Trash2 } from "lucide-react";
import type { ConsoleEntry } from "./debug-types";

const CONSOLE_COLORS: Record<string, string> = {
  info: "text-foreground",
  warn: "text-amber-500",
  error: "text-destructive",
  debug: "text-primary",
};

interface Props {
  entries: ConsoleEntry[];
  onClear: () => void;
}

export const DebugConsole = memo(function DebugConsole({ entries, onClear }: Props) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Terminal className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-xs">Console vazio. Inicie uma sessão de debug.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-2">
        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={onClear}>
          <Trash2 className="h-3 w-3 mr-1" />
          Limpar
        </Button>
      </div>
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2 py-0.5">
          <span className="text-[9px] text-muted-foreground font-mono shrink-0">
            {new Date(entry.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <span className={`text-[10px] font-mono ${CONSOLE_COLORS[entry.level]}`}>
            {entry.message}
          </span>
        </div>
      ))}
    </>
  );
});
