import { saveToolConnector, disconnectToolConnector } from "@/lib/save-tool-connector";
import { type WebSearchProviderId } from "@/lib/tool-connectors";

export type { WebSearchProviderId } from "@/lib/tool-connectors";

const LABELS: Record<WebSearchProviderId, string> = {
  jina: "Jina",
  brave: "Brave Search",
  tavily: "Tavily",
  serper: "Serper",
  firecrawl: "Firecrawl",
  exa: "Exa",
  parallel: "Parallel",
};

export async function saveWebSearchKey(provider: WebSearchProviderId, token: string) {
  return saveToolConnector({
    kind: "web_search",
    provider,
    token,
    label: LABELS[provider],
  });
}

export async function disconnectWebSearch(provider?: WebSearchProviderId) {
  await disconnectToolConnector({
    kind: "web_search",
    provider,
  });
}
