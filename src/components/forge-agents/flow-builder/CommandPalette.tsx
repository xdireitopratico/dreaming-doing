/**
 * CommandPalette — Ctrl+K search interface
 * Fixed: imports PanelType from shared types, includes all 24 panels
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Save, Upload, Play, Rocket, Clock, BarChart3, Wrench, Database,
  LayoutTemplate, Webhook, History, Activity, Users, CalendarClock,
  Globe, KeyRound, Bell, Bug, MessageSquare, Undo2, Redo2,
  Search, Keyboard, Zap, FileArchive, Languages, AlertTriangle, Shield, Code,
} from "lucide-react";
import type { PanelType } from "./flow-builder-types";
import type { LucideIcon } from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  category: string;
  icon: LucideIcon;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onTogglePanel: (panel: PanelType) => void;
  onSave: () => void;
  onPublish: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function CommandPalette({
  open, onClose, onTogglePanel, onSave, onPublish, onUndo, onRedo,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = useMemo(() => [
    // Actions
    { id: "save", label: "Salvar flow", category: "Ações", icon: Save, shortcut: "Ctrl+S", action: () => { onSave(); onClose(); } },
    { id: "publish", label: "Publicar agente", category: "Ações", icon: Upload, shortcut: "Ctrl+Shift+P", action: () => { onPublish(); onClose(); } },
    { id: "undo", label: "Desfazer", category: "Ações", icon: Undo2, shortcut: "Ctrl+Z", action: () => { onUndo(); onClose(); } },
    { id: "redo", label: "Refazer", category: "Ações", icon: Redo2, shortcut: "Ctrl+Shift+Z", action: () => { onRedo(); onClose(); } },
    // Panels
    { id: "p-test", label: "Testar", category: "Painéis", icon: Play, shortcut: "1", action: () => { onTogglePanel("test"); onClose(); } },
    { id: "p-deploy", label: "Deploy", category: "Painéis", icon: Rocket, shortcut: "2", action: () => { onTogglePanel("deploy"); onClose(); } },
    { id: "p-logs", label: "Logs de Execução", category: "Painéis", icon: Clock, action: () => { onTogglePanel("logs"); onClose(); } },
    { id: "p-eval", label: "Avaliação", category: "Painéis", icon: BarChart3, action: () => { onTogglePanel("eval"); onClose(); } },
    { id: "p-tools", label: "Tools", category: "Painéis", icon: Wrench, action: () => { onTogglePanel("tools"); onClose(); } },
    { id: "p-rag", label: "RAG Pipeline", category: "Painéis", icon: Database, action: () => { onTogglePanel("rag"); onClose(); } },
    { id: "p-templates", label: "Templates", category: "Painéis", icon: LayoutTemplate, action: () => { onTogglePanel("templates"); onClose(); } },
    { id: "p-hooks", label: "Webhooks", category: "Painéis", icon: Webhook, action: () => { onTogglePanel("hooks"); onClose(); } },
    { id: "p-versions", label: "Versões", category: "Painéis", icon: History, action: () => { onTogglePanel("versions"); onClose(); } },
    { id: "p-analytics", label: "Analytics", category: "Painéis", icon: Activity, action: () => { onTogglePanel("analytics"); onClose(); } },
    { id: "p-team", label: "Equipe", category: "Painéis", icon: Users, action: () => { onTogglePanel("team"); onClose(); } },
    { id: "p-schedules", label: "Agendamentos", category: "Painéis", icon: CalendarClock, action: () => { onTogglePanel("schedules"); onClose(); } },
    { id: "p-market", label: "Marketplace", category: "Painéis", icon: Globe, action: () => { onTogglePanel("market"); onClose(); } },
    { id: "p-secrets", label: "Secrets", category: "Painéis", icon: KeyRound, action: () => { onTogglePanel("secrets"); onClose(); } },
    { id: "p-notif", label: "Notificações", category: "Painéis", icon: Bell, action: () => { onTogglePanel("notifications"); onClose(); } },
    { id: "p-debug", label: "Debug", category: "Painéis", icon: Bug, shortcut: "3", action: () => { onTogglePanel("debug"); onClose(); } },
    { id: "p-comments", label: "Comentários", category: "Painéis", icon: MessageSquare, action: () => { onTogglePanel("comments"); onClose(); } },
    { id: "p-exportimport", label: "Backup", category: "Painéis", icon: FileArchive, action: () => { onTogglePanel("exportimport"); onClose(); } },
    { id: "p-language", label: "Idioma", category: "Configuração", icon: Languages, action: () => { onTogglePanel("language"); onClose(); } },
    { id: "p-hitl", label: "HITL", category: "Configuração", icon: Users, action: () => { onTogglePanel("hitl"); onClose(); } },
    { id: "p-dlq", label: "Dead Letter Queue", category: "Configuração", icon: AlertTriangle, action: () => { onTogglePanel("dlq"); onClose(); } },
    { id: "p-privacy", label: "LGPD / Privacidade", category: "Configuração", icon: Shield, action: () => { onTogglePanel("privacy"); onClose(); } },
    { id: "p-apidocs", label: "API Docs", category: "Configuração", icon: Code, action: () => { onTogglePanel("apidocs"); onClose(); } },
  ], [onSave, onPublish, onUndo, onRedo, onTogglePanel, onClose]);

  const filtered = useMemo(() => {
    if (!search.trim()) return commands;
    const q = search.toLowerCase();
    return commands.filter(c => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
  }, [commands, search]);

  useEffect(() => {
    if (open) { setSearch(""); setSelectedIndex(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && filtered[selectedIndex]) { e.preventDefault(); filtered[selectedIndex].action(); }
  };

  const grouped = useMemo(() => {
    const map: Record<string, CommandItem[]> = {};
    filtered.forEach(c => { if (!map[c.category]) map[c.category] = []; map[c.category].push(c); });
    return map;
  }, [filtered]);

  let flatIndex = 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="prometheus-studio max-w-lg p-0 gap-0 overflow-hidden"
        aria-label="Command Palette"
        style={{ background: 'var(--ps-bg)', borderColor: 'var(--ps-border)', color: 'var(--ps-cream)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--ps-border)' }}>
          <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--ps-cream-40)' }} />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar ações, painéis..."
            className="border-0 shadow-none focus-visible:ring-0 h-8 px-0"
            style={{ background: 'transparent', color: 'var(--ps-cream)' }}
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono" style={{ background: 'var(--ps-bg-surface-hover)', color: 'var(--ps-cream-40)' }}>Esc</kbd>
        </div>

        <ScrollArea className="max-h-[340px]">
          <div className="p-2" role="listbox">
            {filtered.length === 0 && (
              <div className="text-center py-6 text-sm" style={{ color: 'var(--ps-cream-40)' }}>Nenhum resultado para "{search}"</div>
            )}
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ps-cream-25)' }}>{category}</div>
                {items.map((item) => {
                  const idx = flatIndex++;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      role="option"
                      aria-selected={idx === selectedIndex}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
                      style={{
                        background: idx === selectedIndex ? 'var(--ps-accent-subtle)' : undefined,
                        color: idx === selectedIndex ? 'var(--ps-accent)' : 'var(--ps-cream-80)',
                      }}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--ps-cream-40)' }} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.shortcut && (
                        <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: 'var(--ps-cream-40)', background: 'var(--ps-bg-surface-hover)' }}>{item.shortcut}</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="px-4 py-2 border-t flex items-center gap-4 text-[10px]" style={{ borderColor: 'var(--ps-border)', background: 'var(--ps-bg-surface)', color: 'var(--ps-cream-25)' }}>
          <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> Navegar</span>
          <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Enter</span>
          <span>Esc para fechar</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
