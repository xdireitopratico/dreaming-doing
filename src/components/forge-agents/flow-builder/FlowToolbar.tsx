/**
 * FlowToolbar — Redesigned with grouped dropdown menus
 * Primary actions visible, secondary grouped into 4 categories
 */
import { memo } from "react";
import { PrometheusSessionList } from "@/components/forge-prometheus/PrometheusSessionList";
import { PrometheusThemeToggle } from "@/components/forge-prometheus/PrometheusThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Save, X, Upload, Undo2, Redo2, CheckCircle2, AlertTriangle,
  Play, Wrench, Database, LayoutTemplate, Webhook, KeyRound, CalendarClock,
  Clock, Activity, BarChart3, Bug, History, Stethoscope,
  Users, MessageSquare, Bell,
  Languages, Shield, Code, FileArchive, Globe, Settings, FileJson,
} from "lucide-react";
import type { PanelType } from "./flow-builder-types";

interface FlowToolbarProps {
  flowName: string;
  flowStatus: string;
  hasUnsaved: boolean;
  saving: boolean;
  validationErrors: string[];
  activePanel: PanelType;
  unreadNotifCount: number;
  totalComments: number;
  onFlowNameChange: (name: string) => void;
  onClose: () => void;
  onSave: () => void;
  onPublish: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePanel: (panel: PanelType) => void;
  onResumeSession?: (flowId: string) => void;
  onOpenAgent?: (flowId: string) => void;
}

interface MenuGroup {
  label: string;
  icon: React.ElementType;
  items: { panel: NonNullable<PanelType>; icon: React.ElementType; label: string }[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    label: "Ferramentas",
    icon: Wrench,
    items: [
      { panel: "tools", icon: Wrench, label: "Tools" },
      { panel: "rag", icon: Database, label: "RAG Pipeline" },
      { panel: "templates", icon: LayoutTemplate, label: "Templates" },
      { panel: "hooks", icon: Webhook, label: "Webhooks" },
      { panel: "secrets", icon: KeyRound, label: "Secrets" },
      { panel: "schedules", icon: CalendarClock, label: "Agendamentos" },
      { panel: "openapi-import", icon: FileJson, label: "Importar API" },
    ],
  },
  {
    label: "Análise",
    icon: BarChart3,
    items: [
      { panel: "logs", icon: Clock, label: "Logs de Execução" },
      { panel: "analytics", icon: Activity, label: "Analytics" },
      { panel: "eval", icon: BarChart3, label: "Avaliação" },
      { panel: "physician", icon: Stethoscope, label: "Physician" },
      { panel: "codex", icon: BarChart3, label: "Codex" },
      { panel: "debug", icon: Bug, label: "Debug" },
      { panel: "versions", icon: History, label: "Versões" },
    ],
  },
  {
    label: "Colaboração",
    icon: Users,
    items: [
      { panel: "team", icon: Users, label: "Equipe" },
      { panel: "comments", icon: MessageSquare, label: "Comentários" },
      { panel: "notifications", icon: Bell, label: "Notificações" },
    ],
  },
  {
    label: "Configuração",
    icon: Settings,
    items: [
      { panel: "language", icon: Languages, label: "Idioma" },
      { panel: "hitl", icon: Users, label: "HITL" },
      { panel: "dlq", icon: AlertTriangle, label: "Dead Letter Queue" },
      { panel: "privacy", icon: Shield, label: "LGPD / Privacidade" },
      { panel: "apidocs", icon: Code, label: "API Docs" },
      { panel: "exportimport", icon: FileArchive, label: "Backup" },
      { panel: "market", icon: Globe, label: "Marketplace" },
    ],
  },
];

const MENU_GROUPS_ORDER = ["Configuração", "Colaboração", "Análise", "Ferramentas"] as const;
const ORDERED_MENU_GROUPS = MENU_GROUPS_ORDER
  .map((label) => MENU_GROUPS.find((g) => g.label === label))
  .filter((g): g is MenuGroup => Boolean(g));

export const FlowToolbar = memo(function FlowToolbar({
  flowName, flowStatus, hasUnsaved, saving, validationErrors,
  activePanel, unreadNotifCount, totalComments,
  onFlowNameChange, onClose, onSave, onPublish, onUndo, onRedo, onTogglePanel,
  onResumeSession, onOpenAgent,
}: FlowToolbarProps) {
  return (
    <div className="h-12 border-b flex items-center justify-between px-3 gap-2 shrink-0 relative" style={{ background: 'var(--ps-bg)', borderColor: 'var(--ps-border)', color: 'var(--ps-cream)' }}>
      {/* Left: Close + Name + Status */}
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost" size="icon" className="h-7 w-7 shrink-0"
          onClick={onClose} title="Fechar editor"
          style={{ color: 'var(--ps-cream-40)' }}
        >
          <X className="h-4 w-4" />
        </Button>
        <Input
          value={flowName}
          onChange={(e) => onFlowNameChange(e.target.value)}
          className="w-44 h-7 text-xs font-semibold border-none"
          style={{ background: 'var(--ps-bg-surface)', color: 'var(--ps-cream)' }}
        />
        <Badge variant="secondary" className="text-[10px] shrink-0" style={{ background: 'var(--ps-accent-subtle)', color: 'var(--ps-accent)', border: '1px solid var(--ps-border-accent-dim)' }}>{flowStatus}</Badge>
        {hasUnsaved && <span className="text-[10px] shrink-0" style={{ color: 'var(--ps-orange)' }}>● Não salvo</span>}
      </div>

      {/* Center: Validation + Undo / Redo (fixo no meio do header) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1">
        <Button
          variant={activePanel === "validation" ? "default" : "ghost"}
          size="sm" className="gap-1 h-7 px-2"
          onClick={() => onTogglePanel("validation")}
        >
          {validationErrors.length === 0 ? (
            <><CheckCircle2 className="h-3 w-3 text-emerald-500" /><span className="text-[10px]">OK</span></>
          ) : (
            <><AlertTriangle className="h-3 w-3 text-amber-500" /><span className="text-[10px]">{validationErrors.length}</span></>
          )}
        </Button>

        {/* Ícones de menu: Tema → Configuração → Colaboração → Análise → Ferramentas → Meus Agentes */}
        <div className="flex items-center gap-1">
          <PrometheusThemeToggle />
          {ORDERED_MENU_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            const hasActiveItem = group.items.some(i => activePanel === i.panel);
            const badgeCount = group.items.reduce((sum, item) => {
              if (item.panel === "notifications") return sum + unreadNotifCount;
              if (item.panel === "comments") return sum + totalComments;
              return sum;
            }, 0);

            return (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={hasActiveItem ? "default" : "ghost"}
                    size="icon"
                    className="h-7 w-7 relative"
                    title={group.label}
                    style={{ color: hasActiveItem ? 'var(--ps-accent)' : 'var(--ps-cream-60)' }}
                  >
                    <GroupIcon className="h-3.5 w-3.5" />
                    {badgeCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[8px] rounded-full h-3.5 min-w-3.5 flex items-center justify-center px-0.5">
                        {badgeCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48" style={{ background: 'var(--ps-bg)', borderColor: 'var(--ps-border)', color: 'var(--ps-cream)' }}>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--ps-cream-40)' }}>
                    {group.label}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator style={{ background: 'var(--ps-border)' }} />
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    const isActive = activePanel === item.panel;
                    const itemBadge = item.panel === "notifications" ? unreadNotifCount
                      : item.panel === "comments" ? totalComments : 0;
                    return (
                      <DropdownMenuItem
                        key={item.panel}
                        onClick={() => onTogglePanel(item.panel)}
                        className="gap-2 text-xs"
                        style={{
                          color: isActive ? 'var(--ps-accent)' : 'var(--ps-cream-80)',
                          background: isActive ? 'var(--ps-accent-subtle)' : undefined,
                        }}
                      >
                        <ItemIcon className="h-3.5 w-3.5" />
                        {item.label}
                        {itemBadge > 0 && (
                          <Badge variant="destructive" className="ml-auto text-[9px] px-1 py-0 h-4">
                            {itemBadge}
                          </Badge>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}

          <PrometheusSessionList onResumeSession={onResumeSession} onOpenAgent={onOpenAgent} />
        </div>

        <div className="w-px h-5" style={{ background: 'var(--ps-border)' }} />

        {/* Primary Actions: Salvar → Testar → Publicar (à direita, extremidade) */}
        <Button variant="outline" size="sm" className="gap-1 h-7 text-xs border-none" onClick={onSave} disabled={saving} title="Salvar (Ctrl+S)" style={{ background: 'linear-gradient(135deg, #1a1e27, #0b0d12)', color: 'var(--ps-cream)' }}>
          <Save className="h-3.5 w-3.5" />
          Salvar
        </Button>
        <Button
          size="sm" className="gap-1 h-7 text-xs border-none"
          onClick={() => onTogglePanel("test")}
          title="Testar (1)"
          style={{ background: activePanel === "test" ? 'var(--ps-accent)' : 'linear-gradient(135deg, #1a1e27, #0b0d12)', color: activePanel === "test" ? '#0b0d12' : 'var(--ps-cream)' }}
        >
          <Play className="h-3.5 w-3.5" />
          Testar
        </Button>
        <Button size="sm" className="gap-1 h-7 text-xs" onClick={onPublish} title="Publicar (Ctrl+Shift+P)" style={{ background: 'var(--ps-accent)', border: 'none', color: '#0b0d12' }}>
          <Upload className="h-3.5 w-3.5" />
          Publicar
        </Button>
      </div>
    </div>
  );
});
