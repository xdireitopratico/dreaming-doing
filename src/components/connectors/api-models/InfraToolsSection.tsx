import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Box, ChevronDown, ChevronRight, Globe, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";
import type { E2bHealthResponse } from "@/lib/test-e2b-key";
import type { WebSearchProviderId } from "@/lib/save-web-search-key";

const WEB_SEARCH_PROVIDERS = [
  { id: "brave", label: "Brave", keyPrefix: "BS" },
  { id: "tavily", label: "Tavily", keyPrefix: "tvly-" },
  { id: "serper", label: "Serper", keyPrefix: "" },
  { id: "firecrawl", label: "Firecrawl", keyPrefix: "fc-" },
];

interface InfraToolsSectionProps {
  expanded: boolean;
  onToggle: () => void;
  e2bKeyValue: string;
  onE2bKeyChange: (v: string) => void;
  e2bConnected: boolean;
  e2bHealth: E2bHealthResponse | null;
  e2bTesting: boolean;
  onSaveE2b: () => void;
  onTestE2b: () => void;
  onDeleteE2b: () => void;
  ollamaBaseUrl: string;
  onOllamaBaseUrlChange: (v: string) => void;
  ollamaModel: string;
  onOllamaModelChange: (v: string) => void;
  ollamaApiKey: string;
  onOllamaApiKeyChange: (v: string) => void;
  ollamaConnected: boolean;
  onSaveOllama: () => void;
  onDeleteOllama: () => void;
  webSearchRow: { kind: string; meta?: Record<string, unknown> | null } | null | undefined;
  savingId: string | null;
  onSaveWebSearch: (provider: WebSearchProviderId, token: string) => void;
  onDeleteWebSearch: () => void;
}

export function InfraToolsSection({
  expanded,
  onToggle,
  e2bKeyValue,
  onE2bKeyChange,
  e2bConnected,
  e2bHealth,
  e2bTesting,
  onSaveE2b,
  onTestE2b,
  onDeleteE2b,
  webSearchRow,
  savingId,
  onSaveWebSearch,
  onDeleteWebSearch,
}: InfraToolsSectionProps) {
  const [webSearchProvider, setWebSearchProvider] = useState<WebSearchProviderId>("brave");
  const [webSearchKey, setWebSearchKey] = useState("");

  const webSearchMeta = useMemo(() => {
    if (!webSearchRow || webSearchRow.kind !== "web-search") return null;
    return (webSearchRow.meta ?? {}) as { provider?: string };
  }, [webSearchRow]);

  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--surface-2)]/40 transition-colors"
      >
        <h2 className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)]">
          <Box className="size-3 text-[var(--primary)]" />
          3 · Infra & Tools
        </h2>
        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-6">
              {/* E2B */}
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30">
                <h3 className="font-mono text-[11px] mb-1">E2B Sandbox</h3>
                <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-3">
                  Preview ao vivo e execução do agente.
                </p>
                <ApiKeyInput
                  label="Chave API E2B"
                  value={e2bKeyValue}
                  onChange={onE2bKeyChange}
                  onDelete={e2bConnected ? onDeleteE2b : undefined}
                  provider="e2b"
                  placeholder="e2b_..."
                  saved={e2bConnected}
                  disabled={savingId === "e2b"}
                />
                {e2bHealth && (
                  <p
                    className={`font-mono text-[9px] mt-2 ${
                      e2bHealth.ok ? "text-[var(--success)]" : "text-[var(--destructive)]"
                    }`}
                  >
                    {e2bHealth.ok
                      ? `OK · ${e2bHealth.templateUsed ?? "?"}`
                      : `Falha: ${e2bHealth.error ?? "teste não passou"}`}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[var(--primary)] text-[#0a0a0a]"
                    disabled={savingId === "e2b" || !e2bKeyValue.trim()}
                    onClick={onSaveE2b}
                  >
                    {savingId === "e2b" ? "Validando…" : e2bConnected ? "Atualizar" : "Salvar"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={e2bTesting || savingId === "e2b" || (!e2bKeyValue.trim() && !e2bConnected)}
                    onClick={onTestE2b}
                  >
                    {e2bTesting ? "Testando…" : "Testar"}
                  </Button>
                </div>
              </div>

              {/* WebSearch */}
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30">
                <h3 className="font-mono text-[11px] mb-1 flex items-center gap-2">
                  <Globe className="size-3.5" />
                  Web Search
                </h3>
                <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-3">
                  Motor de busca do agente.
                </p>

                <div className="grid gap-3 sm:grid-cols-2 mb-3">
                  <div>
                    <Label className="font-mono text-[9px] text-[var(--text-dim)]">Provider</Label>
                    <select
                      value={webSearchProvider}
                      onChange={(e) => setWebSearchProvider(e.target.value as WebSearchProviderId)}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                    >
                      {WEB_SEARCH_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="font-mono text-[9px] text-[var(--text-dim)]">Chave</Label>
                    <Input
                      value={webSearchKey}
                      onChange={(e) => setWebSearchKey(e.target.value)}
                      placeholder={WEB_SEARCH_PROVIDERS.find((p) => p.id === webSearchProvider)?.keyPrefix + "..."}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>

                {webSearchMeta?.provider && (
                  <p className="font-mono text-[9px] text-emerald-400/90 mb-2">
                    Conectado: {webSearchMeta.provider}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[var(--primary)] text-[#0a0a0a]"
                    disabled={savingId?.startsWith("websearch") || !webSearchKey.trim()}
                    onClick={() => {
                      onSaveWebSearch(webSearchProvider, webSearchKey);
                      setWebSearchKey("");
                    }}
                  >
                    {savingId?.startsWith("websearch") ? "Salvando…" : "Salvar"}
                  </Button>
                  {webSearchMeta?.provider && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={savingId === "websearch"}
                      onClick={onDeleteWebSearch}
                    >
                      Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
