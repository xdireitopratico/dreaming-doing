export type ToolConnectorKind = "web_search" | "web_scrape" | "browser_runtime";

export type WebSearchProviderId =
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

export type ParserIndexProviderId = "builtin" | "llamaindex" | "cheerio" | "markitdown";

export type ToolProviderDefinition = {
  id: string;
  label: string;
  description: string;
  keyPrefix?: string;
  tokenLabel?: string;
  baseUrlLabel?: string;
  defaultBaseUrl?: string;
  needsToken: boolean;
  needsBaseUrl?: boolean;
  docUrl?: string;
};

const WEB_SEARCH_PROVIDER_LIST: ToolProviderDefinition[] = [
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
    description: "Reader leve, sem chave na maioria dos casos.",
    needsToken: false,
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
    description: "Crawler self-host para extração mais controlada.",
    needsToken: false,
    needsBaseUrl: true,
    baseUrlLabel: "Endpoint do Crawl4AI",
    docUrl: "https://github.com/unclecode/crawl4ai",
  },
  {
    id: "scrapegraphai",
    label: "ScrapeGraphAI",
    description: "Pipeline de scrape por grafo e schema.",
    needsToken: false,
    needsBaseUrl: true,
    baseUrlLabel: "Endpoint do ScrapeGraphAI",
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
    needsToken: false,
    needsBaseUrl: true,
    baseUrlLabel: "Endpoint do Browser Use",
    docUrl: "https://github.com/browser-use/browser-use",
  },
];

const PARSER_INDEX_PROVIDER_LIST: ToolProviderDefinition[] = [
  {
    id: "builtin",
    label: "Builtin parser",
    description: "Parser interno limpo e rápido.",
    needsToken: false,
  },
  {
    id: "llamaindex",
    label: "LlamaIndex",
    description: "Indexação e parsing com ecossistema LlamaIndex.",
    needsToken: false,
    docUrl: "https://github.com/run-llama/llama_index",
  },
  {
    id: "cheerio",
    label: "Cheerio",
    description: "Parser DOM leve para HTML estruturado.",
    needsToken: false,
    docUrl: "https://cheerio.js.org/",
  },
  {
    id: "markitdown",
    label: "MarkItDown",
    description: "Conversão de conteúdo para Markdown com foco em limpeza.",
    needsToken: false,
    docUrl: "https://github.com/microsoft/markitdown",
  },
];

export function webSearchProviders(): ToolProviderDefinition[] {
  return WEB_SEARCH_PROVIDER_LIST;
}

export function webScrapeProviders(): ToolProviderDefinition[] {
  return WEB_SCRAPE_PROVIDER_LIST;
}

export function browserRuntimeProviders(): ToolProviderDefinition[] {
  return BROWSER_RUNTIME_PROVIDER_LIST;
}

export function parserIndexProviders(): ToolProviderDefinition[] {
  return PARSER_INDEX_PROVIDER_LIST;
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
