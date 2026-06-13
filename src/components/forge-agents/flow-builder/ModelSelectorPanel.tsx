/**
 * ModelSelectorPanel — Seletor universal de modelos multi-provedor
 * Hierarquia: Provedor → Modelo com filtros, tags e indicadores
 * @version 1.0.0 — Round 33
 */
import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronRight, Cpu, Cloud, Zap, Clock, Coins } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  PROVIDERS,
  type ModelDefinition,
  type ProviderDefinition,
} from "./model-catalog-frontend";

interface ModelSelectorPanelProps {
  selectedModelId: string;
  onSelect: (modelId: string) => void;
  /** Filter to only models that are chat-allowed */
  chatOnly?: boolean;
  className?: string;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  anthropic: <Cloud className="h-3.5 w-3.5" />,
  google: <Zap className="h-3.5 w-3.5" />,
  groq: <Zap className="h-3.5 w-3.5" />,
  lovable: <Cloud className="h-3.5 w-3.5" />,
  nvidia: <Cpu className="h-3.5 w-3.5" />,
  ollama: <Cpu className="h-3.5 w-3.5" />,
  openai: <Cloud className="h-3.5 w-3.5" />,
  openrouter: <Cloud className="h-3.5 w-3.5" />,
  perplexity: <Cloud className="h-3.5 w-3.5" />,
  xai: <Zap className="h-3.5 w-3.5" />,
};

export function ModelSelectorPanel({
  selectedModelId,
  onSelect,
  chatOnly = false,
  className,
}: ModelSelectorPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => {
    // Auto-expand the provider of the currently selected model
    const selected = PROVIDERS.find((p) => p.models.some((m) => m.id === selectedModelId));
    return new Set(selected ? [selected.id] : []);
  });

  const filteredProviders = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return PROVIDERS.map((provider) => {
      let models = provider.models.filter((m) => !m.deprecated);
      if (chatOnly) models = models.filter((m) => m.chatAllowed);
      if (q) {
        models = models.filter(
          (m) =>
            m.label.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q) ||
            m.tags.some((t) => t.toLowerCase().includes(q)) ||
            provider.label.toLowerCase().includes(q)
        );
      }
      return { ...provider, models };
    }).filter((p) => p.models.length > 0);
  }, [searchQuery, chatOnly]);

  const toggleProvider = (id: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalModels = filteredProviders.reduce((acc, p) => acc + p.models.length, 0);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={`Buscar em ${totalModels} modelos...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 text-xs pl-7"
        />
      </div>

      {/* Provider list */}
      <ScrollArea className="flex-1 max-h-[320px]">
        <div className="space-y-1">
          {filteredProviders.map((provider) => (
            <ProviderGroup
              key={provider.id}
              provider={provider}
              expanded={expandedProviders.has(provider.id) || !!searchQuery}
              onToggle={() => toggleProvider(provider.id)}
              selectedModelId={selectedModelId}
              onSelect={onSelect}
            />
          ))}
          {filteredProviders.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum modelo encontrado
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ProviderGroup({
  provider,
  expanded,
  onToggle,
  selectedModelId,
  onSelect,
}: {
  provider: ProviderDefinition & { models: ModelDefinition[] };
  expanded: boolean;
  onToggle: () => void;
  selectedModelId: string;
  onSelect: (id: string) => void;
}) {
  const hasSelected = provider.models.some((m) => m.id === selectedModelId);
  const icon = PROVIDER_ICONS[provider.id] || <Cloud className="h-3.5 w-3.5" />;

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="w-full">
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium hover:bg-accent/50 transition-colors",
            hasSelected && "bg-accent/30"
          )}
        >
          {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <span className={cn("p-1 rounded", provider.badgeBg, provider.badgeText)}>{icon}</span>
          <span className="flex-1 text-left">{provider.label}</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1">
            {provider.models.length}
          </Badge>
          {provider.platformProvided ? (
            <Badge className="text-[9px] h-4 px-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-0">
              ✅
            </Badge>
          ) : (
            <Badge className="text-[9px] h-4 px-1 bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border-0">
              BYOK
            </Badge>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 space-y-0.5 py-1">
          {provider.models.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              provider={provider}
              isSelected={model.id === selectedModelId}
              onSelect={() => onSelect(model.id)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ModelRow({
  model,
  provider,
  isSelected,
  onSelect,
}: {
  model: ModelDefinition;
  provider: ProviderDefinition;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onSelect}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors",
              "hover:bg-accent/50",
              isSelected && "bg-primary/10 ring-1 ring-primary/30 font-medium"
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="flex-1 truncate">{model.label}</span>
              {model.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="text-[9px] opacity-70">{tag.split(" ")[0]}</span>
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {model.latency}
              </span>
              {model.params && <span>{model.params}</span>}
              {model.quality && (
                <span className={cn(
                  "uppercase font-bold",
                  model.quality === "very-high" && "text-amber-500",
                  model.quality === "high" && "text-blue-500",
                  model.quality === "medium" && "text-muted-foreground",
                  model.quality === "low" && "text-muted-foreground/60",
                )}>
                  {model.quality}
                </span>
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[220px]">
          <p className="font-semibold text-xs">{model.label}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{model.description}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {model.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0">{tag}</Badge>
            ))}
          </div>
          {model.maxContextTokens && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Contexto: {model.maxContextTokens >= 1000000 ? `${Math.round(model.maxContextTokens/1000)}K` : model.maxContextTokens >= 1000 ? `${Math.round(model.maxContextTokens/1000)}K` : model.maxContextTokens} tokens
            </p>
          )}
          {model.ram && (
            <p className="text-[10px] text-muted-foreground mt-0.5">RAM: {model.ram}</p>
          )}
          {(model.costPer1kIn != null && model.costPer1kIn > 0) && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Coins className="h-2.5 w-2.5" />
              ${model.costPer1kIn}/1K in — ${model.costPer1kOut}/1K out
            </p>
          )}
          {model.costPer1kIn === 0 && (
            <p className="text-[10px] text-emerald-500 font-medium mt-0.5">Gratuito (local)</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
