import { supabase } from "@/integrations/supabase/client";

export type WebSearchProviderId = "brave" | "tavily" | "serper" | "firecrawl";

const LABELS: Record<WebSearchProviderId, string> = {
  brave: "Brave Search",
  tavily: "Tavily",
  serper: "Serper",
  firecrawl: "Firecrawl",
};

export async function saveWebSearchKey(provider: WebSearchProviderId, token: string) {
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: {
      kind: "web_search",
      token: token.trim(),
      meta: { provider, label: LABELS[provider] },
    },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string };
  if (res?.error) throw new Error(res.error);
  return res;
}

export async function disconnectWebSearch() {
  const { data, error } = await supabase.functions.invoke("connector-upsert", {
    body: { kind: "web_search", disconnect: true },
  });
  if (error) throw new Error(error.message);
  const res = data as { error?: string };
  if (res?.error) throw new Error(res.error);
}