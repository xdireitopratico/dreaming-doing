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

type InfraKind = "web_search" | "web_scrape" | "browser_runtime";

type ConnectorRowLike = {
  kind: string;
  meta?: Record<string, unknown> | null;
  provider?: string | null;
  updated_at?: string | null;
};

type ConnectionState = {
  exactRow: ConnectorRowLike | null;
  sharedRow: ConnectorRowLike | null;
  activeRow: ConnectorRowLike | null;
  savedProviders: string[];
  exactSaved: boolean;
  sharedSaved: boolean;
};

interface InfraToolsSectionProps {
  expanded: boolean;
  onToggle: () => void;
  ollamaBaseUrl: string;
  onOllamaBaseUrlChange: (v: string) => void;
  ollamaModel: string;
  onOllamaModelChange: (v: string) => void;
  ollamaApiKey: string;
  onOllamaApiKeyChange: (v: string) => void;
  ollamaConnected: boolean;
  onSaveOllama: () => void;
  onDeleteOllama: () => void;
  infraRows: ConnectorRowLike[];
  webSearchProvider: WebSearchProviderId;
  onWebSearchProviderChange: (value: WebSearchProviderId) => void;
  webScrapeProvider: WebScrapeProviderId;
  onWebScrapeProviderChange: (value: WebScrapeProviderId) => void;
  browserRuntimeProvider: BrowserRuntimeProviderId;
  onBrowserRuntimeProviderChange: (value: BrowserRuntimeProviderId) => void;
  parserProvider: ParserIndexProviderId;
  onParserProviderChange: (value: ParserIndexProviderId) => void;
  savingId: string | null;
  onSaveWebSearch: (provider: WebSearchProviderId, token: string) => Promise<boolean>;
  onDeleteWebSearch: (provider: WebSearchProviderId) => void | Promise<void>;
  onSaveWebScrape: (
    provider: WebScrapeProviderId,
    token: string,
    baseUrl?: string,
  ) => Promise<boolean>;
  onDeleteWebScrape: (provider: WebScrapeProviderId) => void | Promise<void>;
  onSaveBrowserRuntime: (
    provider: BrowserRuntimeProviderId,
    token: string,
    baseUrl?: string,
  ) => Promise<boolean>;
  onDeleteBrowserRuntime: (provider: BrowserRuntimeProviderId) => void | Promise<void>;
  webSearchFallback?: string;
  webScrapeFallback?: string;
  browserFallback?: string;
  onWebSearchFallbackChange: (value: string) => void;
  onWebScrapeFallbackChange: (value: string) => void;
  onBrowserFallbackChange: (value: string) => void;
}

const KIND_LABEL: Record<InfraKind, string> = {
  web_search: "Web Search",
  web_scrape: "Web Scrape",
  browser_runtime: "Browser Runtime",
};

function rowProvider(row: ConnectorRowLike | null | undefined): string {
  return (
    row?.provider?.trim() ||
    (row?.meta as { provider?: string } | undefined)?.provider ||
    ""
  ).trim();
}

function rowBaseUrl(row: ConnectorRowLike | null | undefined): string {
  const meta = (row?.meta ?? {}) as { baseUrl?: string };
  return typeof meta.baseUrl === "string" ? meta.baseUrl.trim() : "";
}

function rowTimestamp(row: ConnectorRowLike): number {
  const raw = typeof row.updated_at === "string" ? Date.parse(row.updated_at) : NaN;
  return Number.isFinite(raw) ? raw : 0;
}

function sortRows(rows: ConnectorRowLike[]): ConnectorRowLike[] {
  return [...rows].sort((a, b) => rowTimestamp(b) - rowTimestamp(a));
}

function uniqueProviders(rows: ConnectorRowLike[], kind: InfraKind): string[] {
  const seen = new Set<string>();
  const providers: string[] = [];
  for (const row of rows) {
    if (row.kind !== kind) continue;
    const provider = rowProvider(row);
    if (!provider || seen.has(provider)) continue;
    seen.add(provider);
    providers.push(provider);
  }
  return providers;
}

function resolveConnectionState(
  rows: ConnectorRowLike[],
  kind: InfraKind,
  provider: string,
): ConnectionState {
  const exactRow = rows.find((row) => row.kind === kind && rowProvider(row) === provider) ?? null;
  const sharedRow = rows.find((row) => row.kind !== kind && rowProvider(row) === provider) ?? null;

  return {
    exactRow,
    sharedRow,
    activeRow: exactRow ?? sharedRow,
    savedProviders: uniqueProviders(rows, kind),
    exactSaved: !!exactRow,
    sharedSaved: !exactRow && !!sharedRow,
  };
}

function connectionMessage(state: ConnectionState): string | null {
  if (state.exactRow) {
    return `Chave específica conectada nesta seção via ${rowProvider(state.exactRow)}.`;
  }
  if (state.sharedRow) {
    return `Usando chave compartilhada via ${KIND_LABEL[state.sharedRow.kind as InfraKind]}. Salve aqui apenas se quiser sobrescrever esta seção.`;
  }
  return null;
}

function findProviderRow(rows: ConnectorRowLike[], provider: string): ConnectorRowLike | null {
  return rows.find((row) => rowProvider(row) === provider) ?? null;
}

function saveDisabled(
  token: string,
  needsToken: boolean,
  supportsOptionalToken: boolean,
  baseUrl: string,
  needsBaseUrl: boolean,
) {
  if (needsToken && !token.trim()) return true;
  if (supportsOptionalToken && !needsToken && !token.trim()) return true;
  if (needsBaseUrl && !baseUrl.trim()) return true;
  return false;
}

function SavedProvidersRow({ title, providers }: { title: string; providers: string[] }) {
  if (providers.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1 font-mono text-[9px] text-[var(--text-ghost)]">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {providers.map((provider) => (
          <span
            key={provider}
            className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[8px] text-emerald-300"
          >
            {provider}
          </span>
        ))}
      </div>
    </div>
  );
}

function helperToneClass(tone: "success" | "warning" | "neutral") {
  if (tone === "success") return "text-emerald-300";
  if (tone === "warning") return "text-amber-300";
  return "text-[var(--text-ghost)]";
}

function parserExecutionHint(parser: ParserIndexProviderId): string {
  return parser === "builtin"
    ? "Melhor ponto de partida: rápido, estável e equilibrado para a maior parte das extrações web."
    : "Melhor ponto de partida: rápido, estável e equilibrado para a maior parte das extrações web.";
}

function providerTokenHint(meta: ReturnType<typeof providerDefinitionFor> | undefined) {
  if (meta?.supportsOptionalToken && meta.isFreeByDefault) {
    return "Sem chave, usa a rota gratuita. Se você salvar uma API key, passa a usar sua própria cota.";
  }
  return meta?.description ?? "";
}

function fallbackHint(
  kind: "web_search" | "web_scrape" | "browser_runtime",
  fallback: string | undefined,
  rows: ConnectorRowLike[],
): { tone: "success" | "warning" | "neutral"; text: string } | null {
  if (!fallback || fallback === "none") {
    return {
      tone: "neutral",
      text: "Nenhum segundo provider configurado. Esta etapa depende apenas do primário.",
    };
  }

  if (kind === "web_search") {
    if (fallback === "jina") {
      return {
        tone: "success",
        text: "Fallback gratuito via Jina Search. Se houver Jina API Key salva, ele usa sua cota automaticamente.",
      };
    }
    if (fallback === "searxng") {
      return {
        tone: "warning",
        text: "SearXNG exige base URL self-hosted e ainda não tem configuração dedicada nesta tela.",
      };
    }
    const row = findProviderRow(rows, fallback);
    const meta = providerDefinitionFor("web_search", fallback);
    if (!meta) return null;
    if (row) {
      return {
        tone: "success",
        text: `${meta.label} está pronto e vai reutilizar a chave salva em ${KIND_LABEL[row.kind as InfraKind]}.`,
      };
    }
    return {
      tone: "warning",
      text: `${meta.label} exige chave API salva antes de funcionar como fallback.`,
    };
  }

  if (kind === "web_scrape") {
    if (fallback === "jina") {
      return {
        tone: "success",
        text: "Fallback gratuito via Jina Reader. Se o Jina falhar, o runtime ainda fecha em HTTP direto.",
      };
    }
    if (fallback === "http") {
      return {
        tone: "success",
        text: "Fallback final gratuito via HTTP direto. Não precisa de chave, mas pode extrair conteúdo mais sujo.",
      };
    }
    const row = findProviderRow(rows, fallback);
    const meta = providerDefinitionFor("web_scrape", fallback);
    if (!meta) return null;
    if (row) {
      return {
        tone: "success",
        text: `${meta.label} está pronto e vai reutilizar a configuração salva em ${KIND_LABEL[row.kind as InfraKind]}.`,
      };
    }
    return {
      tone: "warning",
      text: meta.needsBaseUrl
        ? `${meta.label} exige chave API e Base URL salvas antes de funcionar como fallback.`
        : `${meta.label} exige chave API salva antes de funcionar como fallback.`,
    };
  }

  if (kind === "browser_runtime") {
    const row = findProviderRow(rows, fallback);
    const meta = providerDefinitionFor("browser_runtime", fallback);
    if (!meta) return null;
    if (row) {
      return {
        tone: "success",
        text: `${meta.label} está pronto e pode ser usado como segundo runtime.`,
      };
    }
    return {
      tone: "warning",
      text: meta.needsBaseUrl
        ? `${meta.label} exige chave API e Base URL antes de funcionar como fallback.`
        : `${meta.label} exige chave API antes de funcionar como fallback.`,
    };
  }

  return null;
}

export function InfraToolsSection({
  expanded,
  onToggle,
  ollamaBaseUrl,
  onOllamaBaseUrlChange,
  ollamaModel,
  onOllamaModelChange,
  ollamaApiKey,
  onOllamaApiKeyChange,
  ollamaConnected,
  onSaveOllama,
  onDeleteOllama,
  infraRows,
  webSearchProvider,
  onWebSearchProviderChange,
  webScrapeProvider,
  onWebScrapeProviderChange,
  browserRuntimeProvider,
  onBrowserRuntimeProviderChange,
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
  const [webSearchKey, setWebSearchKey] = useState("");
  const [webScrapeKey, setWebScrapeKey] = useState("");
  const [webScrapeBaseUrl, setWebScrapeBaseUrl] = useState("");
  const [browserRuntimeKey, setBrowserRuntimeKey] = useState("");
  const [browserRuntimeBaseUrl, setBrowserRuntimeBaseUrl] = useState("");

  const orderedInfraRows = useMemo(() => sortRows(infraRows), [infraRows]);

  const webSearchMeta = useMemo(
    () => providerDefinitionFor("web_search", webSearchProvider),
    [webSearchProvider],
  );
  const webScrapeMeta = useMemo(
    () => providerDefinitionFor("web_scrape", webScrapeProvider),
    [webScrapeProvider],
  );
  const browserMeta = useMemo(
    () => providerDefinitionFor("browser_runtime", browserRuntimeProvider),
    [browserRuntimeProvider],
  );
  const parserMeta = useMemo(
    () => providerDefinitionFor("parser_index", parserProvider),
    [parserProvider],
  );
  const parserOptions = useMemo(() => parserIndexProviders(), []);

  const webSearchState = useMemo(
    () => resolveConnectionState(orderedInfraRows, "web_search", webSearchProvider),
    [orderedInfraRows, webSearchProvider],
  );
  const webScrapeState = useMemo(
    () => resolveConnectionState(orderedInfraRows, "web_scrape", webScrapeProvider),
    [orderedInfraRows, webScrapeProvider],
  );
  const browserRuntimeState = useMemo(
    () => resolveConnectionState(orderedInfraRows, "browser_runtime", browserRuntimeProvider),
    [orderedInfraRows, browserRuntimeProvider],
  );
  const resolvedWebSearchFallback =
    webSearchFallback ?? (webSearchProvider === "jina" ? "none" : "jina");
  const resolvedWebScrapeFallback = webScrapeFallback ?? "http";
  const resolvedBrowserFallback = browserFallback ?? "none";
  const webSearchFallbackInfo = useMemo(
    () => fallbackHint("web_search", resolvedWebSearchFallback, orderedInfraRows),
    [orderedInfraRows, resolvedWebSearchFallback],
  );
  const webScrapeFallbackInfo = useMemo(
    () => fallbackHint("web_scrape", resolvedWebScrapeFallback, orderedInfraRows),
    [orderedInfraRows, resolvedWebScrapeFallback],
  );
  const browserFallbackInfo = useMemo(
    () => fallbackHint("browser_runtime", resolvedBrowserFallback, orderedInfraRows),
    [orderedInfraRows, resolvedBrowserFallback],
  );

  useEffect(() => {
    setWebScrapeBaseUrl(rowBaseUrl(webScrapeState.activeRow));
  }, [webScrapeState.activeRow]);

  useEffect(() => {
    setBrowserRuntimeBaseUrl(rowBaseUrl(browserRuntimeState.activeRow));
  }, [browserRuntimeState.activeRow]);

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-[var(--surface-2)]/40"
      >
        <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-dim)]">
          <Box className="size-3 text-[var(--primary)]" />3 · Tools
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
            <div className="flex flex-col gap-6 px-5 pb-5">
              <div className="order-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 p-4">
                <h3 className="mb-1 flex items-center gap-2 font-mono text-[11px]">
                  <Search className="size-3.5 text-[var(--primary)]" />
                  Web Search
                </h3>
                <p className="mb-3 font-mono text-[9px] text-[var(--text-ghost)]">
                  Descobre URLs e páginas relevantes antes do scrape.
                </p>

                <SavedProvidersRow
                  title="Providers com chave específica salva nesta seção"
                  providers={webSearchState.savedProviders}
                />

                <div className="mb-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="font-mono text-[9px] text-[var(--text-dim)]">Provider</Label>
                    <select
                      value={webSearchProvider}
                      onChange={(e) =>
                        onWebSearchProviderChange(e.target.value as WebSearchProviderId)
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                    >
                      {webSearchProviders().map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <ApiKeyInput
                      label={webSearchMeta?.tokenLabel ?? "Chave"}
                      value={webSearchKey}
                      onChange={setWebSearchKey}
                      provider={webSearchProvider}
                      placeholder={(webSearchMeta?.keyPrefix ?? "sk-") + "..."}
                      saved={webSearchState.exactSaved || webSearchState.sharedSaved}
                      disabled={savingId === `websearch-${webSearchProvider}`}
                    />
                    {providerTokenHint(webSearchMeta) && (
                      <p className="mt-1 font-mono text-[9px] text-[var(--text-ghost)]">
                        {providerTokenHint(webSearchMeta)}
                      </p>
                    )}
                  </div>
                </div>

                {connectionMessage(webSearchState) && (
                  <p className="mb-3 font-mono text-[9px] text-emerald-400/90">
                    {connectionMessage(webSearchState)}
                  </p>
                )}

                <div className="mb-3">
                  <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                    Fallback (segundo provider se o primário falhar)
                  </Label>
                  <select
                    value={resolvedWebSearchFallback}
                    onChange={(e) => onWebSearchFallbackChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                  >
                    <option value="none">Nenhum (só o primário)</option>
                    <option value="jina">Jina Search (gratuito / BYOK opcional)</option>
                    <option value="searxng">SearXNG (self-hosted)</option>
                    {webSearchProviders()
                      .filter(
                        (provider) => provider.id !== webSearchProvider && provider.id !== "jina",
                      )
                      .map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                  </select>
                </div>
                {webSearchFallbackInfo && (
                  <p
                    className={`mb-3 font-mono text-[9px] ${helperToneClass(webSearchFallbackInfo.tone)}`}
                  >
                    {webSearchFallbackInfo.text}
                  </p>
                )}

                {webSearchMeta?.docUrl && (
                  <a
                    href={webSearchMeta.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-3 inline-flex items-center gap-1 text-[9px] text-[var(--primary)] hover:underline"
                  >
                    <ExternalLink className="size-3" />
                    Documentação
                  </a>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[var(--primary)] text-[#0a0a0a]"
                    disabled={
                      savingId === `websearch-${webSearchProvider}` ||
                      saveDisabled(
                        webSearchKey,
                        !!webSearchMeta?.needsToken,
                        !!webSearchMeta?.supportsOptionalToken,
                        "",
                        false,
                      )
                    }
                    onClick={async () => {
                      const ok = await onSaveWebSearch(webSearchProvider, webSearchKey);
                      if (ok) setWebSearchKey("");
                    }}
                  >
                    {savingId === `websearch-${webSearchProvider}` ? "Salvando…" : "Salvar"}
                  </Button>
                  {webSearchState.exactSaved && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={savingId === "websearch"}
                      onClick={() => onDeleteWebSearch(webSearchProvider)}
                    >
                      Remover override desta seção
                    </Button>
                  )}
                </div>
              </div>

              <div className="order-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 p-4">
                <h3 className="mb-1 flex items-center gap-2 font-mono text-[11px]">
                  <Globe className="size-3.5 text-[var(--primary)]" />
                  Web Scrape
                </h3>
                <p className="mb-3 font-mono text-[9px] text-[var(--text-ghost)]">
                  Extrai conteúdo limpo da URL já conhecida.
                </p>

                <SavedProvidersRow
                  title="Providers com chave específica salva nesta seção"
                  providers={webScrapeState.savedProviders}
                />

                <div className="mb-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="font-mono text-[9px] text-[var(--text-dim)]">Provider</Label>
                    <select
                      value={webScrapeProvider}
                      onChange={(e) =>
                        onWebScrapeProviderChange(e.target.value as WebScrapeProviderId)
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                    >
                      {webScrapeProviders().map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
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
                  {(webScrapeMeta?.needsToken || webScrapeMeta?.supportsOptionalToken) && (
                    <div>
                      <ApiKeyInput
                        label={webScrapeMeta.tokenLabel ?? "Chave"}
                        value={webScrapeKey}
                        onChange={setWebScrapeKey}
                        provider={webScrapeProvider}
                        placeholder={(webScrapeMeta.keyPrefix ?? "sk-") + "..."}
                        saved={webScrapeState.exactSaved || webScrapeState.sharedSaved}
                        disabled={savingId === `webscrape-${webScrapeProvider}`}
                      />
                      {providerTokenHint(webScrapeMeta) && (
                        <p className="mt-1 font-mono text-[9px] text-[var(--text-ghost)]">
                          {providerTokenHint(webScrapeMeta)}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {connectionMessage(webScrapeState) && (
                  <p className="mb-3 font-mono text-[9px] text-emerald-400/90">
                    {connectionMessage(webScrapeState)}
                  </p>
                )}

                <div className="mb-3">
                  <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                    Fallback (segundo provider se o primário falhar)
                  </Label>
                  <select
                    value={resolvedWebScrapeFallback}
                    onChange={(e) => onWebScrapeFallbackChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                  >
                    <option value="http">HTTP direto (gratuito)</option>
                    <option value="jina">Jina Reader (gratuito / BYOK opcional)</option>
                    {webScrapeProviders()
                      .filter(
                        (provider) => provider.id !== webScrapeProvider && provider.id !== "jina",
                      )
                      .map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                  </select>
                </div>
                {webScrapeFallbackInfo && (
                  <p
                    className={`mb-3 font-mono text-[9px] ${helperToneClass(webScrapeFallbackInfo.tone)}`}
                  >
                    {webScrapeFallbackInfo.text}
                  </p>
                )}

                {webScrapeMeta?.docUrl && (
                  <a
                    href={webScrapeMeta.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-3 inline-flex items-center gap-1 text-[9px] text-[var(--primary)] hover:underline"
                  >
                    <ExternalLink className="size-3" />
                    Documentação
                  </a>
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
                        !!webScrapeMeta?.supportsOptionalToken,
                        webScrapeBaseUrl,
                        !!webScrapeMeta?.needsBaseUrl,
                      )
                    }
                    onClick={async () => {
                      const ok = await onSaveWebScrape(
                        webScrapeProvider,
                        webScrapeKey,
                        webScrapeBaseUrl,
                      );
                      if (ok) setWebScrapeKey("");
                    }}
                  >
                    {savingId === `webscrape-${webScrapeProvider}` ? "Salvando…" : "Salvar"}
                  </Button>
                  {webScrapeState.exactSaved && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={savingId === "webscrape"}
                      onClick={() => onDeleteWebScrape(webScrapeProvider)}
                    >
                      Remover override desta seção
                    </Button>
                  )}
                </div>
              </div>

              <div className="order-1 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 p-4">
                <h3 className="mb-1 flex items-center gap-2 font-mono text-[11px]">
                  <Database className="size-3.5 text-[var(--primary)]" />
                  Browser Runtime
                </h3>
                <p className="mb-3 font-mono text-[9px] text-[var(--text-ghost)]">
                  Runtime para automação real dos browsers e fluxos que exigem navegação.
                </p>

                <div className="space-y-4">
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Box className="size-3.5 text-[var(--primary)]" />
                      <span className="font-mono text-[10px] font-medium">Render provider</span>
                    </div>

                    <SavedProvidersRow
                      title="Providers com chave específica salva nesta seção"
                      providers={browserRuntimeState.savedProviders}
                    />

                    <div className="mb-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                          Provider
                        </Label>
                        <select
                          value={browserRuntimeProvider}
                          onChange={(e) =>
                            onBrowserRuntimeProviderChange(
                              e.target.value as BrowserRuntimeProviderId,
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                        >
                          {browserRuntimeProviders().map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.label}
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
                          <ApiKeyInput
                            label={browserMeta.tokenLabel ?? "Chave"}
                            value={browserRuntimeKey}
                            onChange={setBrowserRuntimeKey}
                            provider={browserRuntimeProvider}
                            placeholder={(browserMeta.keyPrefix ?? "sk-") + "..."}
                            saved={
                              browserRuntimeState.exactSaved || browserRuntimeState.sharedSaved
                            }
                            disabled={savingId === `browserruntime-${browserRuntimeProvider}`}
                          />
                        </div>
                      )}
                    </div>

                    {connectionMessage(browserRuntimeState) && (
                      <p className="mb-3 font-mono text-[9px] text-emerald-400/90">
                        {connectionMessage(browserRuntimeState)}
                      </p>
                    )}

                    <div className="mb-1">
                      <Label className="font-mono text-[9px] text-[var(--text-dim)]">
                        Fallback (segundo provider se o primário falhar)
                      </Label>
                      <select
                        value={resolvedBrowserFallback}
                        onChange={(e) => onBrowserFallbackChange(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                      >
                        <option value="none">Nenhum (só o primário)</option>
                        {browserRuntimeProviders()
                          .filter((provider) => provider.id !== browserRuntimeProvider)
                          .map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.label}
                            </option>
                          ))}
                      </select>
                    </div>
                    {browserFallbackInfo && (
                      <p
                        className={`mb-3 font-mono text-[9px] ${helperToneClass(browserFallbackInfo.tone)}`}
                      >
                        {browserFallbackInfo.text}
                      </p>
                    )}

                    {browserMeta?.docUrl && (
                      <a
                        href={browserMeta.docUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-3 inline-flex items-center gap-1 text-[9px] text-[var(--primary)] hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        Documentação
                      </a>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="bg-[var(--primary)] text-[#0a0a0a]"
                        disabled={
                          savingId === `browserruntime-${browserRuntimeProvider}` ||
                          saveDisabled(
                            browserRuntimeKey,
                            !!browserMeta?.needsToken,
                            !!browserMeta?.supportsOptionalToken,
                            browserRuntimeBaseUrl,
                            !!browserMeta?.needsBaseUrl,
                          )
                        }
                        onClick={async () => {
                          const ok = await onSaveBrowserRuntime(
                            browserRuntimeProvider,
                            browserRuntimeKey,
                            browserRuntimeBaseUrl,
                          );
                          if (ok) setBrowserRuntimeKey("");
                        }}
                      >
                        {savingId === `browserruntime-${browserRuntimeProvider}`
                          ? "Salvando…"
                          : "Salvar"}
                      </Button>
                      {browserRuntimeState.exactSaved && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={savingId === "browserruntime"}
                          onClick={() => onDeleteBrowserRuntime(browserRuntimeProvider)}
                        >
                          Remover override desta seção
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="order-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 p-4">
                <h3 className="mb-1 flex items-center gap-2 font-mono text-[11px]">
                  <Layers3 className="size-3.5 text-[var(--primary)]" />
                  Web Parser
                </h3>
                <p className="mb-3 font-mono text-[9px] text-[var(--text-ghost)]">
                  Escolha o parser que vai organizar o conteúdo web extraído pela plataforma.
                </p>

                <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <Label className="font-mono text-[9px] text-[var(--text-dim)]">Provider</Label>
                    <select
                      value={parserProvider}
                      onChange={(e) =>
                        onParserProviderChange(e.target.value as ParserIndexProviderId)
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--foreground)]"
                    >
                      {parserOptions.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[9px] text-[var(--text-ghost)]">
                      Todos os providers deste bloco sao gratuitos e nao exigem chave API.
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

                <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/30 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-sky-300">
                      qualidade
                    </span>
                    <span className="font-mono text-[10px] text-[var(--foreground)]">
                      Diferença prática
                    </span>
                  </div>
                  <p className="font-mono text-[9px] text-[var(--text-ghost)]">
                    {parserExecutionHint(parserProvider)}
                  </p>
                  {parserMeta?.description && (
                    <p className="mt-2 font-mono text-[9px] text-[var(--text-dim)]">
                      {parserMeta.description}
                    </p>
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
