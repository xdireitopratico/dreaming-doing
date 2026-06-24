import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  Globe,
  Layers3,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";
import type { E2bHealthResponse } from "@/lib/test-e2b-key";
import {
  browserRuntimeProviders,
  parserIndexProviders,
  providerDefinitionFor,
  webScrapeProviders,
  webSearchProviders,
  type BrowserRuntimeProviderId,
  type ParserIndexProviderId,
  type WebScrapeProviderId,
  type WebSearchProviderId,
} from "@/lib/tool-connectors";

type ConnectorRowLike = { kind: string; meta?: Record<string, unknown> | null; provider?: string | null };

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
  webSearchRow: ConnectorRowLike | null | undefined;
  webScrapeRow: ConnectorRowLike | null | undefined;
  browserRuntimeRow: ConnectorRowLike | null | undefined;
  parserProvider: ParserIndexProviderId;
  onParserProviderChange: (value: ParserIndexProviderId) => void;
  savingId: string | null;
  onSaveWebSearch: (provider: WebSearchProviderId, token: string) => void;
  onDeleteWebSearch: () => void;
  onSaveWebScrape: (provider: WebScrapeProviderId, token: string, baseUrl?: string) => void;
  onDeleteWebScrape: (provider: WebScrapeProviderId) => void;
  onSaveBrowserRuntime: (
    provider: BrowserRuntimeProviderId,
    token: string,
    baseUrl?: string,
  ) => void;
  onDeleteBrowserRuntime: (provider: BrowserRuntimeProviderId) => void;
  // Fallback chain — segundo provider se o primário falhar. Vai em agent_preferences.
  webSearchFallback?: string;
  webScrapeFallback?: string;
  browserFallback?: string;
  onWebSearchFallbackChange: (value: string) => void;
  onWebScrapeFallbackChange: (value: string) => void;
  onBrowserFallbackChange: (value: string) => void;
}

function rowProvider(row: ConnectorRowLike | null | undefined): string {
  return (row?.provider?.trim() || (row?.meta as { provider?: string } | undefined)?.provider || "").trim();
}

function rowBaseUrl(row: ConnectorRowLike | null | undefined): string {
  const meta = (row?.meta ?? {}) as { baseUrl?: string };
  return typeof meta.baseUrl === "string" ? meta.baseUrl.trim() : "";
}

function saveDisabled(token: string, needsToken: boolean, baseUrl: string, needsBaseUrl: boolean) {
  if (needsToken && !token.trim()) return true;
  if (needsBaseUrl && !baseUrl.trim()) return true;
  return false;
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
  ollamaBaseUrl,
  onOllamaBaseUrlChange,
  ollamaModel,
  onOllamaModelChange,
  ollamaApiKey,
  onOllamaApiKeyChange,
  ollamaConnected,
  onSaveOllama,
  onDeleteOllama,
  webSearchRow,
  webScrapeRow,
  browserRuntimeRow,
  parserProvider,
  onParserProviderChange,
  savingId,
  onSaveWebSearch,
  onDeleteWebSearch,
  onSaveWebScrape,
  onDeleteWebScrape,
  onSaveBrowserRuntime,
  onDeleteBrowserRuntime,
  webSearchFallback,
  webScrapeFallback,
  browserFallback,
  onWebSearchFallbackChange,
  onWebScrapeFallbackChange,
  onBrowserFallbackChange,
}: InfraToolsSectionProps) {
  const [webSearchProvider, setWebSearchProvider] = useState<WebSearchProviderId>("brave");
  const [webSearchKey, setWebSearchKey] = useState("");

  const [webScrapeProvider, setWebScrapeProvider] = useState<WebScrapeProviderId>("jina");
  const [webScrapeKey, setWebScrapeKey] = useState("");
  const [webScrapeBaseUrl, setWebScrapeBaseUrl] = useState("");

  const [browserProvider, setBrowserProvider] = useState<BrowserRuntimeProviderId>("browserless");
  const [browserRuntimeKey, setBrowserRuntimeKey] = useState("");
  const [browserRuntimeBaseUrl, setBrowserRuntimeBaseUrl] = useState("");

  useEffect(() => {
    const provider = rowProvider(webSearchRow);
    if (provider) setWebSearchProvider(provider as WebSearchProviderId);
  }, [webSearchRow]);

  useEffect(() => {
    const provider = rowProvider(webScrapeRow);
    if (provider) setWebScrapeProvider(provider as WebScrapeProviderId);
    setWebScrapeBaseUrl(rowBaseUrl(webScrapeRow));
  }, [webScrapeRow]);

  useEffect(() => {
    const provider = rowProvider(browserRuntimeRow);
    if (provider) setBrowserProvider(provider as BrowserRuntimeProviderId);
    setBrowserRuntimeBaseUrl(rowBaseUrl(browserRuntimeRow));
  }, [browserRuntimeRow]);

  const webSearchMeta = useMemo(
    () => providerDefinitionFor("web_search", webSearchProvider),
    [webSearchProvider],
  );
  const webScrapeMeta = useMemo(
    () => providerDefinitionFor("web_scrape", webScrapeProvider),
    [webScrapeProvider],
  );
  const browserMeta = useMemo(
    () => providerDefinitionFor("browser_runtime", browserProvider),
    [browserProvider],
  );
  const parserMeta = useMemo(
    () => providerDefinitionFor("parser_index", parserProvider),
    [parserProvider],
  );
  const parserOptions = useMemo(() => parserIndexProviders(), []);

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
            <div className="px-5 pb-5 flex flex-col gap-6">
              <div className="order-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30">
                <h3 className="font-mono text-[11px] mb-1 flex items-center gap-2">
                  <Search className="size-3.5 text-[var(--primary)]" />
                  Web Search
                </h3>
                <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-3">
                  Descobre URLs e páginas relevantes antes do scrape.
                </p>

                <div className="grid gap-3 sm:grid-cols-2 mb-3">
                  <div>
                    <Label className="font-mono text-[9px] text-[var(--text-dim)]">Provider</Label>
                    <select
                      value={webSearchProvider}
                      onChange={(e) => setWebSearchProvider(e.target.value as WebSearchProviderId)}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                    >
                      {webSearchProviders().map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                      {webSearchMeta?.tokenLabel ?? "Chave"}
                    </Label>
                    <Input
                      value={webSearchKey}
                      onChange={(e) => setWebSearchKey(e.target.value)}
                      placeholder={(webSearchMeta?.keyPrefix ?? "sk-") + "..."}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                    Fallback (segundo provider se o primário falhar)
                  </Label>
                  <select
                    value={webSearchFallback ?? "jina"}
                    onChange={(e) => onWebSearchFallbackChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                  >
                    <option value="jina">Jina Search (gratuito)</option>
                    <option value="searxng">SearXNG (self-hosted)</option>
                    {webSearchProviders()
                      .filter((p) => p.id !== webSearchProvider)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                  </select>
                </div>

                {webSearchMeta?.docUrl && (
                  <a
                    href={webSearchMeta.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[9px] text-[var(--primary)] hover:underline mb-3"
                  >
                    <ExternalLink className="size-3" />
                    Documentação
                  </a>
                )}

                {webSearchRow?.provider && (
                  <p className="font-mono text-[9px] text-emerald-400/90 mb-2">
                    Conectado: {webSearchRow.provider}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[var(--primary)] text-[#0a0a0a]"
                    disabled={savingId === `websearch-${webSearchProvider}` || saveDisabled(webSearchKey, true, "", false)}
                    onClick={() => onSaveWebSearch(webSearchProvider, webSearchKey)}
                  >
                    {savingId === `websearch-${webSearchProvider}` ? "Salvando…" : "Salvar"}
                  </Button>
                  {webSearchRow?.provider && (
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

              <div className="order-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30">
                <h3 className="font-mono text-[11px] mb-1 flex items-center gap-2">
                  <Globe className="size-3.5 text-[var(--primary)]" />
                  Web Scrape
                </h3>
                <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-3">
                  Extrai conteúdo limpo da URL já conhecida.
                </p>

                <div className="grid gap-3 sm:grid-cols-2 mb-3">
                  <div>
                    <Label className="font-mono text-[9px] text-[var(--text-dim)]">Provider</Label>
                    <select
                      value={webScrapeProvider}
                      onChange={(e) => setWebScrapeProvider(e.target.value as WebScrapeProviderId)}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                    >
                      {webScrapeProviders().map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {webScrapeMeta?.needsBaseUrl && (
                    <div>
                      <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                        {webScrapeMeta.baseUrlLabel ?? "Base URL"}
                      </Label>
                      <Input
                        value={webScrapeBaseUrl}
                        onChange={(e) => setWebScrapeBaseUrl(e.target.value)}
                        placeholder={webScrapeMeta.defaultBaseUrl ?? "https://api.exemplo.com"}
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                  )}
                  {webScrapeMeta?.needsToken && (
                    <div>
                      <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                        {webScrapeMeta.tokenLabel ?? "Chave"}
                      </Label>
                      <Input
                        value={webScrapeKey}
                        onChange={(e) => setWebScrapeKey(e.target.value)}
                        placeholder={(webScrapeMeta?.keyPrefix ?? "sk-") + "..."}
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                  )}
                </div>

                <div className="mb-3">
                  <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                    Fallback (segundo provider se o primário falhar)
                  </Label>
                  <select
                    value={webScrapeFallback ?? "http"}
                    onChange={(e) => onWebScrapeFallbackChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                  >
                    <option value="http">HTTP direto (gratuito)</option>
                    {webScrapeProviders()
                      .filter((p) => p.id !== webScrapeProvider)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                  </select>
                </div>

                {webScrapeMeta?.docUrl && (
                  <a
                    href={webScrapeMeta.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[9px] text-[var(--primary)] hover:underline mb-3"
                  >
                    <ExternalLink className="size-3" />
                    Documentação
                  </a>
                )}

                {webScrapeRow?.provider && (
                  <p className="font-mono text-[9px] text-emerald-400/90 mb-2">
                    Conectado: {webScrapeRow.provider}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[var(--primary)] text-[#0a0a0a]"
                    disabled={
                      savingId === `webscrape-${webScrapeProvider}` ||
                      saveDisabled(
                        webScrapeKey,
                        !!webScrapeMeta?.needsToken,
                        webScrapeBaseUrl,
                        !!webScrapeMeta?.needsBaseUrl,
                      )
                    }
                    onClick={() => onSaveWebScrape(webScrapeProvider, webScrapeKey, webScrapeBaseUrl)}
                  >
                    {savingId === `webscrape-${webScrapeProvider}` ? "Salvando…" : "Salvar"}
                  </Button>
                  {webScrapeRow?.provider && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={savingId === "webscrape"}
                      onClick={() => onDeleteWebScrape(webScrapeProvider)}
                    >
                      Remover
                    </Button>
                  )}
                </div>
              </div>

              <div className="order-1 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30">
                <h3 className="font-mono text-[11px] mb-1 flex items-center gap-2">
                  <Database className="size-3.5 text-[var(--primary)]" />
                  Browser Runtime
                </h3>
                <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-3">
                  Runtime para automação real. E2B continua como caminho principal do deep.
                </p>

                <div className="space-y-4">
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-3">
                    <h4 className="font-mono text-[10px] mb-1">E2B Sandbox</h4>
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

                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Box className="size-3.5 text-[var(--primary)]" />
                      <span className="font-mono text-[10px] font-medium">Render provider</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 mb-3">
                      <div>
                        <Label className="font-mono text-[9px] text-[var(--text-dim)]">Provider</Label>
                        <select
                          value={browserProvider}
                          onChange={(e) => setBrowserProvider(e.target.value as BrowserRuntimeProviderId)}
                          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                        >
                          {browserRuntimeProviders().map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {browserMeta?.needsBaseUrl && (
                        <div>
                          <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                            {browserMeta.baseUrlLabel ?? "Endpoint"}
                          </Label>
                          <Input
                            value={browserRuntimeBaseUrl}
                            onChange={(e) => setBrowserRuntimeBaseUrl(e.target.value)}
                            placeholder={browserMeta.defaultBaseUrl ?? "https://browser-use.local"}
                            className="mt-1 font-mono text-xs"
                          />
                        </div>
                      )}
                      {browserMeta?.needsToken && (
                        <div>
                          <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                            {browserMeta.tokenLabel ?? "Chave"}
                          </Label>
                          <Input
                            value={browserRuntimeKey}
                            onChange={(e) => setBrowserRuntimeKey(e.target.value)}
                            placeholder={(browserMeta?.keyPrefix ?? "sk-") + "..."}
                            className="mt-1 font-mono text-xs"
                          />
                        </div>
                      )}
                    </div>

                    <div className="mb-1">
                      <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                        Fallback (segundo provider se o primário falhar)
                      </Label>
                      <select
                        value={browserFallback ?? "none"}
                        onChange={(e) => onBrowserFallbackChange(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                      >
                        <option value="none">Nenhum (só o primário)</option>
                        {browserRuntimeProviders()
                          .filter((p) => p.id !== browserProvider)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                      </select>
                    </div>

                    {browserMeta?.docUrl && (
                      <a
                        href={browserMeta.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[9px] text-[var(--primary)] hover:underline mb-3"
                      >
                        <ExternalLink className="size-3" />
                        Documentação
                      </a>
                    )}

                    {browserRuntimeRow?.provider && (
                      <p className="font-mono text-[9px] text-emerald-400/90 mb-2">
                        Conectado: {browserRuntimeRow.provider}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="bg-[var(--primary)] text-[#0a0a0a]"
                        disabled={
                          savingId === `browserruntime-${browserProvider}` ||
                          saveDisabled(
                            browserRuntimeKey,
                            !!browserMeta?.needsToken,
                            browserRuntimeBaseUrl,
                            !!browserMeta?.needsBaseUrl,
                          )
                        }
                        onClick={() =>
                          onSaveBrowserRuntime(browserProvider, browserRuntimeKey, browserRuntimeBaseUrl)
                        }
                      >
                        {savingId === `browserruntime-${browserProvider}` ? "Salvando…" : "Salvar"}
                      </Button>
                      {browserRuntimeRow?.provider && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={savingId === "browserruntime"}
                          onClick={() => onDeleteBrowserRuntime(browserProvider)}
                        >
                          Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="order-2 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30">
                <h3 className="font-mono text-[11px] mb-1 flex items-center gap-2">
                  <Layers3 className="size-3.5 text-[var(--primary)]" />
                  Parser & Index
                </h3>
                <p className="font-mono text-[9px] text-[var(--text-ghost)] mb-3">
                  Escolha o motor que estrutura o conteúdo depois do scrape.
                </p>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                  <div>
                    <Label className="font-mono text-[9px] text-[var(--text-dim)]">Provider</Label>
                    <select
                      value={parserProvider}
                      onChange={(e) => onParserProviderChange(e.target.value as ParserIndexProviderId)}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                    >
                      {parserOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[9px] text-[var(--text-ghost)]">
                      LlamaIndex é a melhor opção quando você quer indexação mais rica. O parser
                      builtin é o fallback leve.
                    </p>
                  </div>
                  {parserMeta?.docUrl && (
                    <a
                      href={parserMeta.docUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[9px] text-[var(--primary)] hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      Docs
                    </a>
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
