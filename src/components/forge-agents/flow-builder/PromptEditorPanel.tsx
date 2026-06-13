/**
 * PromptEditorPanel — Editor de prompts com syntax highlight para variáveis dinâmicas
 * Suporta {{input.message}}, {{memory.key}}, {{tool.result}}, etc.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Variable, Eye, EyeOff, Copy, Check } from "lucide-react";

// Available variable categories
const VARIABLE_CATALOG = [
  { category: "Input", variables: [
    { key: "input.message", desc: "Mensagem do usuário" },
    { key: "input.metadata", desc: "Metadados da mensagem" },
    { key: "input.channel", desc: "Canal de origem (web/whatsapp)" },
    { key: "input.session_id", desc: "ID da sessão" },
    { key: "input.user_id", desc: "ID do usuário" },
  ]},
  { category: "Memory", variables: [
    { key: "memory.user_name", desc: "Nome do usuário salvo" },
    { key: "memory.preferences", desc: "Preferências salvas" },
    { key: "memory.history", desc: "Histórico de interações" },
    { key: "memory.custom", desc: "Chave customizada" },
  ]},
  { category: "Tool", variables: [
    { key: "tool.result", desc: "Resultado da última tool" },
    { key: "tool.error", desc: "Erro da última tool" },
    { key: "tool.status", desc: "Status da execução" },
  ]},
  { category: "Context", variables: [
    { key: "context.rag_chunks", desc: "Chunks do RAG Search" },
    { key: "context.rag_sources", desc: "Fontes do RAG" },
    { key: "context.previous_response", desc: "Resposta anterior do LLM" },
    { key: "context.conversation_history", desc: "Histórico completo" },
  ]},
  { category: "System", variables: [
    { key: "system.timestamp", desc: "Data/hora atual" },
    { key: "system.agent_name", desc: "Nome do agente" },
    { key: "system.execution_id", desc: "ID da execução" },
  ]},
];

interface PromptEditorPanelProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minHeight?: string;
}

export function PromptEditorPanel({
  value,
  onChange,
  label = "System Prompt",
  placeholder = "Instruções para o modelo...\n\nUse {{input.message}} para a mensagem do usuário.",
  minHeight = "120px",
}: PromptEditorPanelProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteFilter, setAutocompleteFilter] = useState("");
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef(0);

  // Detect {{ typing for autocomplete
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    cursorPosRef.current = cursorPos;
    onChange(val);

    // Check if user just typed {{ 
    const textBefore = val.substring(0, cursorPos);
    const lastOpen = textBefore.lastIndexOf("{{");
    const lastClose = textBefore.lastIndexOf("}}");

    if (lastOpen > lastClose && lastOpen !== -1) {
      const partial = textBefore.substring(lastOpen + 2);
      if (!partial.includes("\n") && partial.length < 30) {
        setAutocompleteFilter(partial.trim().toLowerCase());
        setShowAutocomplete(true);
        // Position autocomplete near cursor
        const ta = textareaRef.current;
        if (ta) {
          const lineHeight = 18;
          const lines = textBefore.split("\n");
          const currentLine = lines.length - 1;
          const charPos = lines[lines.length - 1].length;
          setAutocompletePos({
            top: Math.min(currentLine * lineHeight + lineHeight + 4, 200),
            left: Math.min(charPos * 6.5, 200),
          });
        }
        return;
      }
    }
    setShowAutocomplete(false);
  }, [onChange]);

  const insertVariable = useCallback((varKey: string) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const val = value;
    const cursorPos = cursorPosRef.current;
    const textBefore = val.substring(0, cursorPos);
    const lastOpen = textBefore.lastIndexOf("{{");

    let newVal: string;
    let newCursor: number;

    if (lastOpen !== -1 && lastOpen > textBefore.lastIndexOf("}}")) {
      // Replace from {{ to cursor with the full variable
      newVal = val.substring(0, lastOpen) + `{{${varKey}}}` + val.substring(cursorPos);
      newCursor = lastOpen + varKey.length + 4;
    } else {
      // Insert at cursor
      newVal = val.substring(0, cursorPos) + `{{${varKey}}}` + val.substring(cursorPos);
      newCursor = cursorPos + varKey.length + 4;
    }

    onChange(newVal);
    setShowAutocomplete(false);

    // Restore focus
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    }, 10);
  }, [value, onChange]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  // Close autocomplete on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAutocomplete(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Render highlighted preview
  const renderHighlighted = (text: string) => {
    const parts = text.split(/({{[^}]*}})/g);
    return parts.map((part, i) => {
      if (part.startsWith("{{") && part.endsWith("}}")) {
        const varName = part.slice(2, -2).trim();
        return (
          <span
            key={i}
            className="inline-block px-1 py-0.5 mx-0.5 rounded text-[10px] font-mono bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
          >
            {part}
          </span>
        );
      }
      return <span key={i} className="whitespace-pre-wrap">{part}</span>;
    });
  };

  // Filter variables for autocomplete
  const filteredVars = VARIABLE_CATALOG.flatMap((cat) =>
    cat.variables
      .filter((v) => !autocompleteFilter || v.key.toLowerCase().includes(autocompleteFilter) || v.desc.toLowerCase().includes(autocompleteFilter))
      .map((v) => ({ ...v, category: cat.category }))
  );

  // Count variables used
  const usedVars = (value.match(/{{[^}]+}}/g) || []).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-1">
          {usedVars > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
              {usedVars} var{usedVars > 1 ? "s" : ""}
            </Badge>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Inserir variável">
                <Variable className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end">
              <ScrollArea className="h-64">
                {VARIABLE_CATALOG.map((cat) => (
                  <div key={cat.category}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground bg-muted/50 sticky top-0">
                      {cat.category}
                    </div>
                    {cat.variables.map((v) => (
                      <button
                        key={v.key}
                        className="w-full text-left px-3 py-1.5 hover:bg-muted/80 transition-colors"
                        onClick={() => insertVariable(v.key)}
                      >
                        <div className="text-xs font-mono text-blue-600 dark:text-blue-400">{`{{${v.key}}}`}</div>
                        <div className="text-[10px] text-muted-foreground">{v.desc}</div>
                      </button>
                    ))}
                  </div>
                ))}
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowPreview(!showPreview)}
            title={showPreview ? "Editar" : "Preview"}
          >
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={copyToClipboard}
            title="Copiar"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="relative">
        {showPreview ? (
          <div
            className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed overflow-auto"
            style={{ minHeight }}
          >
            {value ? renderHighlighted(value) : (
              <span className="text-muted-foreground italic">Prompt vazio</span>
            )}
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInput}
              placeholder={placeholder}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
              style={{ minHeight }}
            />

            {/* Autocomplete dropdown */}
            {showAutocomplete && filteredVars.length > 0 && (
              <div
                className="absolute z-50 w-56 rounded-md border bg-popover shadow-lg overflow-hidden"
                style={{ top: autocompletePos.top, left: Math.min(autocompletePos.left, 60) }}
              >
                <ScrollArea className="max-h-40">
                  {filteredVars.slice(0, 8).map((v) => (
                    <button
                      key={v.key}
                      className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors"
                      onClick={() => insertVariable(v.key)}
                    >
                      <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400">{v.key}</div>
                      <div className="text-[10px] text-muted-foreground">{v.desc}</div>
                    </button>
                  ))}
                </ScrollArea>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
