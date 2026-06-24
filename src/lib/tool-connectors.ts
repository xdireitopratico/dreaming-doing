export type ToolConnectorKind = "web_search" | "web_scrape" | "browser_runtime";

export type WebSearchProviderId =
  | "jina"
  | "brave"
  | "tavily"
  | "serper"
  | "firecrawl"
  | "exa"
  | "parallel";

export type WebScrapeProviderId =
  | "jina"
  | "firecrawl"
  | "browserless"
  | "crawl4ai"
  | "scrapegraphai";

export type BrowserRuntimeProviderId = "browserless" | "browser-use";

export type ParserIndexProviderId = "builtin";

export type ToolProviderDefinition = {
  id: string;
  label: string;
  description: string;
  keyPrefix?: string;
  tokenLabel?: string;
  supportsOptionalToken?: boolean;
  baseUrlLabel?: string;
  defaultBaseUrl?: string;
  needsToken: boolean;
  needsBaseUrl?: boolean;
  docUrl?: string;
  isFreeByDefault?: boolean;
};

function sortProvidersByLabel(list: ToolProviderDefinition[]): ToolProviderDefinition[] {
  return [...list].sort((a, b) => {
    const labelCmp = a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" });
    if (labelCmp !== 0) return labelCmp;
    return a.id.localeCompare(b.id, "pt-BR", { sensitivity: "base" });
  });
}

const WEB_SEARCH_PROVIDER_LIST: ToolProviderDefinition[] = [
  {
    id: "jina",
    label: "Jina",
    description: "Busca gratuita por default; com API key usa sua cota paga.",
    keyPrefix: "jina_",
    tokenLabel: "Jina API Key (opcional)",
    supportsOptionalToken: true,
    needsToken: false,
    isFreeByDefault: true,
    docUrl: "https://jina.ai/",
  },
  {
    id: "brave",
    label: "Brave",
    description: "Busca web rápida com cota grátis.",
    keyPrefix: "BSA",
    tokenLabel: "Brave Search API Key",
    needsToken: true,
    docUrl: "https://brave.com/search/api/",
  },
  {
    id: "tavily",
    label: "Tavily",
    description: "Busca com foco em agentes.",
    keyPrefix: "tvly-",
    tokenLabel: "Tavily API Key",
    needsToken: true,
    docUrl: "https://tavily.com",
  },
  {
    id: "serper",
    label: "Serper",
    description: "Busca Google-friendly via API.",
    keyPrefix: "serper-",
    tokenLabel: "Serper API Key",
    needsToken: true,
    docUrl: "https://serper.dev",
  },
  {
    id: "firecrawl",
    label: "Firecrawl",
    description: "Busca e scrape com uma única infraestrutura.",
    keyPrefix: "fc-",
    tokenLabel: "Firecrawl API Key",
    needsToken: true,
    docUrl: "https://www.firecrawl.dev",
  },
  {
    id: "exa",
    label: "Exa",
    description: "Busca semântica premium para pesquisa de referência.",
    keyPrefix: "exa-",
    tokenLabel: "Exa API Key",
    needsToken: true,
    docUrl: "https://exa.ai/",
  },
  {
    id: "parallel",
    label: "Parallel",
    description: "Search API com foco em ferramentas e agentes.",
    keyPrefix: "par-",
    tokenLabel: "Parallel API Key",
    needsToken: true,
    docUrl: "https://parallel.ai/",
  },
];

const WEB_SCRAPE_PROVIDER_LIST: ToolProviderDefinition[] = [
  {
    id: "jina",
    label: "Jina Reader",
    description: "Reader gratuito por default; com API key usa sua cota paga.",
    keyPrefix: "jina_",
    tokenLabel: "Jina API Key (opcional)",
    supportsOptionalToken: true,
    needsToken: false,
    isFreeByDefault: true,
    docUrl: "https://jina.ai/reader/",
  },
  {
    id: "firecrawl",
    label: "Firecrawl",
    description: "Scrape robusto para conteúdo limpo e estruturado.",
    keyPrefix: "fc-",
    tokenLabel: "Firecrawl API Key",
    needsToken: true,
    docUrl: "https://www.firecrawl.dev",
  },
  {
    id: "browserless",
    label: "Browserless",
    description: "Scrape via browser renderizado.",
    keyPrefix: "bl_",
    tokenLabel: "Browserless API Key",
    needsToken: true,
    docUrl: "https://www.browserless.io/",
  },
  {
    id: "crawl4ai",
    label: "Crawl4AI",
    description: "Crawler cloud/self-host para extração mais controlada.",
    keyPrefix: "sk_",
    tokenLabel: "Crawl4AI API Key",
    needsToken: true,
    needsBaseUrl: true,
    baseUrlLabel: "Base URL do Crawl4AI",
    defaultBaseUrl: "https://api.crawl4ai.com",
    docUrl: "https://github.com/unclecode/crawl4ai",
  },
  {
    id: "scrapegraphai",
    label: "ScrapeGraphAI",
    description: "Pipeline de scrape por grafo e schema.",
    keyPrefix: "sgai-",
    tokenLabel: "ScrapeGraphAI API Key",
    needsToken: true,
    needsBaseUrl: true,
    baseUrlLabel: "Base URL do ScrapeGraphAI",
    defaultBaseUrl: "https://v2-api.scrapegraphai.com",
    docUrl: "https://scrapegraphai.com/",
  },
];

const BROWSER_RUNTIME_PROVIDER_LIST: ToolProviderDefinition[] = [
  {
    id: "browserless",
    label: "Browserless",
    description: "Runtime de navegador hospedado e pronto para Playwright.",
    keyPrefix: "bl_",
    tokenLabel: "Browserless API Key",
    needsToken: true,
    docUrl: "https://www.browserless.io/",
  },
  {
    id: "browser-use",
    label: "Browser Use",
    description: "Runtime agentic com navegador controlado por software.",
    keyPrefix: "bu_",
    tokenLabel: "Browser Use API Key",
    needsToken: true,
    needsBaseUrl: true,
    baseUrlLabel: "Base URL do Browser Use",
    defaultBaseUrl: "https://api.browser-use.com/api/v3",
    docUrl: "https://github.com/browser-use/browser-use",
  },
];

const PARSER_INDEX_PROVIDER_LIST: ToolProviderDefinition[] = [
  {
    id: "builtin",
    label: "Forge Default",
    description:
      "Parser padrão do FORGE para conteúdo web: equilibrado, gratuito e pronto para uso imediato na plataforma.",
    needsToken: false,
  },
];

export function webSearchProviders(): ToolProviderDefinition[] {
  return sortProvidersByLabel(WEB_SEARCH_PROVIDER_LIST);
}

export function webScrapeProviders(): ToolProviderDefinition[] {
  return sortProvidersByLabel(WEB_SCRAPE_PROVIDER_LIST);
}

export function browserRuntimeProviders(): ToolProviderDefinition[] {
  return sortProvidersByLabel(BROWSER_RUNTIME_PROVIDER_LIST);
}

export function parserIndexProviders(): ToolProviderDefinition[] {
  return sortProvidersByLabel(PARSER_INDEX_PROVIDER_LIST);
}

export function providerDefinitionFor(
  kind: ToolConnectorKind | "parser_index",
  providerId: string,
): ToolProviderDefinition | undefined {
  const lists: Record<string, ToolProviderDefinition[]> = {
    web_search: WEB_SEARCH_PROVIDER_LIST,
    web_scrape: WEB_SCRAPE_PROVIDER_LIST,
    browser_runtime: BROWSER_RUNTIME_PROVIDER_LIST,
    parser_index: PARSER_INDEX_PROVIDER_LIST,
  };
  return lists[kind]?.find((p) => p.id === providerId);
}
