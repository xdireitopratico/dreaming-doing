/**
 * Motor Prometheus em /api — LLM (provedores abaixo) + uma provedora de pesquisa web.
 * Secrets do agente publicado ficam no editor (tenant), não aqui.
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Flame, Brain, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  disconnectWebSearch,
  saveWebSearchKey,
  type WebSearchProviderId,
} from "@/lib/save-web-search-key";

interface MotorInfraSectionProps {
  llmConnectedCount: number;
}

const SEARCH_PROVIDERS: {
  id: WebSearchProviderId;
  label: string;
  hint: string;
  placeholder: string;
  docUrl: string;
}[] = [
  {
    id: "brave",
    label: "Brave Search",
    hint: "1000 buscas/mês grátis",
    placeholder: "BSA...",
    docUrl: "https://brave.com/search/api/",
  },
  {
    id: "tavily",
    label: "Tavily",
    hint: "API de pesquisa para agentes",
    placeholder: "tvly-...",
    docUrl: "https://tavily.com",
  },
  {
    id: "serper",
    label: "Serper",
    hint: "Google via API",
    placeholder: "...",
    docUrl: "https://serper.dev",
  },
  {
    id: "firecrawl",
    label: "Firecrawl",
    hint: "Busca + scrape pago",
    placeholder: "fc-...",
    docUrl: "https://www.firecrawl.dev",
  },
];

export function MotorInfraSection({ llmConnectedCount }: MotorInfraSectionProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<WebSearchProviderId>("brave");
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: webSearchRow } = useQuery({
    queryKey: ["web-search-connector", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connectors_public")
        .select("kind, provider, meta")
        .eq("owner_id", user!.id)
        .eq("kind", "web_search" as never)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const connectedProvider = (webSearchRow?.provider || null) as WebSearchProviderId | null;
  const isConnected = !!connectedProvider;

  useEffect(() => {
    if (connectedProvider) setSelected(connectedProvider);
  }, [connectedProvider]);

  useEffect(() => {
    if (isConnected) setKeyValue("");
  }, [isConnected, connectedProvider]);

  const handleSave = useCallback(async () => {
    if (!keyValue.trim()) {
      toast.error("Cole a chave antes de salvar");
      return;
    }
    setSaving(true);
    try {
      await saveWebSearchKey(selected, keyValue);
      setKeyValue("");
      await qc.invalidateQueries({ queryKey: ["web-search-connector"] });
      await qc.invalidateQueries({ queryKey: ["connectors-public"] });
      toast.success(`${SEARCH_PROVIDERS.find((p) => p.id === selected)?.label} salvo para o motor`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }, [keyValue, qc, selected]);

  const handleDisconnect = useCallback(async () => {
    setSaving(true);
    try {
      await disconnectWebSearch();
      setKeyValue("");
      await qc.invalidateQueries({ queryKey: ["web-search-connector"] });
      await qc.invalidateQueries({ queryKey: ["connectors-public"] });
      toast.success("Pesquisa web removida");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setSaving(false);
    }
  }, [qc]);

  const activeMeta = SEARCH_PROVIDERS.find((p) => p.id === selected)!;

  return (
    <motion.section
      id="forge-motor-infra"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/40 scroll-mt-24"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="size-9 rounded-lg border border-orange-400/25 bg-orange-400/10 grid place-items-center shrink-0 text-orange-400">
          <Flame className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-mono text-[11px] tracking-[0.15em] uppercase text-[var(--text-dim)]">
            Motor Prometheus
          </h2>
          <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-1 leading-relaxed">
            Criação de agentes: LLM e pesquisa web aqui. O agente publicado usa chaves no editor (Secrets).
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Brain className="size-3.5 text-[var(--primary)]" />
            <span className="font-mono text-[10px] font-medium">LLM</span>
            <span
              className={`font-mono text-[8px] px-1.5 py-0.5 rounded ${
                llmConnectedCount > 0
                  ? "text-emerald-400 bg-emerald-400/10"
                  : "text-amber-400 bg-amber-400/10"
              }`}
            >
              {llmConnectedCount > 0 ? `${llmConnectedCount} provedor(es)` : "nenhuma chave"}
            </span>
          </div>
          <a
            href="#forge-key-groq"
            className="font-mono text-[9px] text-[var(--primary)] hover:underline"
          >
            Ir para provedores →
          </a>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Search className="size-3.5 text-orange-400" />
            <span className="font-mono text-[10px] font-medium">Pesquisa web</span>
            <span
              className={`font-mono text-[8px] px-1.5 py-0.5 rounded ${
                isConnected
                  ? "text-emerald-400 bg-emerald-400/10"
                  : "text-amber-400 bg-amber-400/10"
              }`}
            >
              {isConnected ? connectedProvider : "opcional"}
            </span>
          </div>

          <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-2">
            Escolha <strong>uma</strong> provedora. Sem chave, o motor segue só com brainstorm.
          </p>

          <div className="flex flex-wrap gap-1 mb-2">
            {SEARCH_PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={`font-mono text-[8px] px-2 py-1 rounded border transition-colors ${
                  selected === p.id
                    ? "border-orange-400/50 bg-orange-400/10 text-orange-300"
                    : "border-[var(--border)] text-[var(--text-ghost)] hover:text-[var(--foreground)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <ApiKeyInput
            label={activeMeta.label}
            value={keyValue}
            onChange={setKeyValue}
            onDelete={isConnected ? () => void handleDisconnect() : undefined}
            provider={selected}
            placeholder={activeMeta.placeholder}
            saved={isConnected && connectedProvider === selected}
            disabled={saving}
          />
          <p className="font-mono text-[8px] text-[var(--text-ghost)] mt-1">{activeMeta.hint}</p>
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-[10px] bg-[var(--primary)] text-[#0a0a0a]"
              disabled={saving || !keyValue.trim()}
              onClick={() => void handleSave()}
            >
              {saving ? "Salvando…" : isConnected ? "Trocar provedora" : "Salvar"}
            </Button>
            <a
              href={activeMeta.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[9px] text-[var(--text-ghost)] self-center hover:text-[var(--foreground)]"
            >
              Docs
            </a>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
