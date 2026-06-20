// tools/web.ts — Web research, scrape e screenshot tools para o agent-run.
// Expõe ao LLM a capacidade de buscar referências visuais reais na web
// durante o Plan e o Build. Usa os providers já implementados em
// _shared/web-research-providers.ts (Firecrawl, Jina, Tavily, Serper, Brave, DuckDuckGo).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { ToolRegistry } from "../registry.ts";
import { researchWebQuery, scrapeWebPage } from "../../_shared/web-research-providers.ts";
import { logger } from "../../_shared/logger.ts";

export interface WebToolsContext {
  supabase: SupabaseClient;
  userId: string;
  /** Keys carregadas de connectors — inclui FIRECRAWL_API_KEY, TAVILY_API_KEY, etc. */
  connectorKeys: Record<string, string>;
}

/** Carrega secrets de web search do connectors table (kind = 'web_search'). */
async function loadWebSearchSecrets(
  supabase: SupabaseClient,
  userId: string,
  fallbackKeys: Record<string, string>,
): Promise<Record<string, string>> {
  const secrets: Record<string, string> = {};

  // 1. Keys que já vieram de connectorKeys (ex: FIRECRAWL_API_KEY pode já estar lá)
  for (const [k, v] of Object.entries(fallbackKeys)) {
    if (
      k === "FIRECRAWL_API_KEY" ||
      k === "TAVILY_API_KEY" ||
      k === "SERPER_API_KEY" ||
      k === "SERPER_KEY" ||
      k === "BRAVE_SEARCH_API_KEY" ||
      k === "BRAVE_API_KEY" ||
      k === "SCREENSHOTONE_API_KEY"
    ) {
      if (typeof v === "string" && v.trim()) secrets[k] = v.trim();
    }
  }

  // 2. Busca connectors do tipo web_search (mesmo pattern do motor-research.ts)
  try {
    const { data, error } = await supabase
      .from("connectors")
      .select("token_encrypted, provider")
      .eq("owner_id", userId)
      .eq("kind", "web_search")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const provider = (data.provider?.trim() || "") as string;
      const tokenRaw = data.token_encrypted;
      let token: string | null = null;

      if (typeof tokenRaw === "string" && tokenRaw.trim().length >= 4) {
        const t = tokenRaw.trim();
        if (t.startsWith("[")) {
          try {
            const arr = JSON.parse(t) as unknown;
            if (Array.isArray(arr)) {
              const first = arr.find((x) => typeof x === "string" && x.trim().length >= 4);
              if (typeof first === "string") token = first.trim();
            }
          } catch {
            token = t;
          }
        } else {
          token = t;
        }
      }

      if (token) {
        const providerKeyMap: Record<string, string> = {
          brave: "BRAVE_SEARCH_API_KEY",
          tavily: "TAVILY_API_KEY",
          serper: "SERPER_API_KEY",
          firecrawl: "FIRECRAWL_API_KEY",
        };
        const keyName = providerKeyMap[provider];
        if (keyName) secrets[keyName] = token;
      }
    }
  } catch (err) {
    logger.warn("web-tools.loadWebSearchSecrets", {
      error: (err as Error).message,
    });
  }

  return secrets;
}

export function registerWebTools(reg: ToolRegistry, ctx: WebToolsContext): void {
  const { supabase, userId, connectorKeys } = ctx;

  // Cache de secrets — carregado sob demanda na primeira chamada
  let secretsCache: Record<string, string> | null = null;
  async function getSecrets(): Promise<Record<string, string>> {
    if (secretsCache) return secretsCache;
    secretsCache = await loadWebSearchSecrets(supabase, userId, connectorKeys);
    return secretsCache;
  }

  // ── http_fetch: fetch HTTP direto e gratuito (sem API key) ──
  reg.register(
    {
      name: "http_fetch",
      description:
        "Fetch HTTP direto e GRATUITO de uma URL — retorna HTML limpo (sem scripts/styles). " +
        "Use quando precisar extrair conteúdo de uma URL específica sem custo. " +
        "Para busca web (encontrar URLs), use web_research. " +
        "Para extração estruturada de DesignDNA, use extract_design_dna.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL completa para fetch.",
          },
        },
        required: ["url"],
      },
    },
    async (args) => {
      try {
        const url = args.url as string;
        if (!url) {
          return { toolCallId: "", ok: false, error: "http_fetch requer 'url'", output: null };
        }
        try {
          new URL(url);
        } catch {
          return { toolCallId: "", ok: false, error: `URL inválida: ${url}`, output: null };
        }

        const response = await fetch(url, {
          headers: { "User-Agent": "AetherForge/1.0 (http_fetch)" },
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
          return { toolCallId: "", ok: false, error: `HTTP ${response.status}`, output: null };
        }
        const html = await response.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 50000);

        return {
          toolCallId: "",
          ok: true,
          output: {
            url,
            content: text,
            word_count: text.split(/\s+/).filter(Boolean).length,
            provider: "http",
          },
        };
      } catch (err) {
        return {
          toolCallId: "",
          ok: false,
          error: `http_fetch falhou: ${(err as Error).message}`,
          output: null,
        };
      }
    },
  );

  // ── web_research: busca web agnóstica (Serper/Tavily/Brave/Firecrawl/DuckDuckGo) ──
  reg.register(
    {
      name: "web_research",
      description:
        "Pesquisa web para encontrar sites, referências de design, documentação ou inspiração. " +
        "Retorna lista de URLs com título e snippet. Use para encontrar referências visuais " +
        "antes de definir o brief de design (ex: 'brutalist editorial bakery website'). " +
        "Funciona sem API key (DuckDuckGo fallback); melhores resultados com Tavily/Serper/Brave configurados.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Query de busca — seja específico para encontrar design de qualidade (ex: 'awwwards bakery website brutalist').",
          },
          limit: {
            type: "number",
            description: "Máximo de resultados (default 5, max 20).",
          },
          provider: {
            type: "string",
            description: "Provedor preferido: auto, tavily, serper, brave, firecrawl, duckduckgo. Default: auto.",
          },
        },
        required: ["query"],
      },
    },
    async (args) => {
      try {
        const secrets = await getSecrets();
        const result = await researchWebQuery(
          {
            query: args.query,
            limit: args.limit ?? 5,
            provider: args.provider ?? "auto",
          },
          secrets,
        );
        return {
          toolCallId: "",
          ok: true,
          output: result,
        };
      } catch (err) {
        return {
          toolCallId: "",
          ok: false,
          error: `web_research falhou: ${(err as Error).message}`,
          output: null,
        };
      }
    },
  );

  // ── web_scrape: extrai conteúdo de uma URL (markdown/html) ──
  reg.register(
    {
      name: "web_scrape",
      description:
        "Extrai conteúdo de uma URL específica — retorna markdown limpo da página. " +
        "Use para analisar a estrutura, layout e design de um site de referência. " +
        "Suporta Firecrawl (com key) e Jina Reader (gratuito). " +
        "Para capturar screenshot visual, use screenshot_capture.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL completa da página a extrair.",
          },
          format: {
            type: "string",
            description: "Formato de saída: markdown (default) ou html.",
          },
          mode: {
            type: "string",
            description: "Modo: read (default, extrai texto) ou screenshot (captura imagem).",
          },
          provider: {
            type: "string",
            description: "Provedor: auto (default), firecrawl, jina, http.",
          },
          only_main_content: {
            type: "boolean",
            description: "Extrair apenas conteúdo principal (default true).",
          },
        },
        required: ["url"],
      },
    },
    async (args) => {
      try {
        const secrets = await getSecrets();
        const result = await scrapeWebPage(
          {
            url: args.url,
            format: args.format ?? "markdown",
            mode: args.mode ?? "read",
            provider: args.provider ?? "auto",
            only_main_content: args.only_main_content ?? true,
          },
          secrets,
        );
        return {
          toolCallId: "",
          ok: true,
          output: result,
        };
      } catch (err) {
        return {
          toolCallId: "",
          ok: false,
          error: `web_scrape falhou: ${(err as Error).message}`,
          output: null,
        };
      }
    },
  );

  // ── screenshot_capture: captura screenshot visual de uma URL ──
  reg.register(
    {
      name: "screenshot_capture",
      description:
        "Captura um screenshot (imagem) de uma URL — retorna URL da imagem. " +
        "Use para obter referência visual real de sites de design premiado. " +
        "Gratuito via thum.io; melhor qualidade com ScreenshotOne (se key configurada).",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL do site para capturar screenshot.",
          },
          width: {
            type: "number",
            description: "Largura do viewport em pixels (default 1280).",
          },
          height: {
            type: "number",
            description: "Altura do viewport em pixels (default 720).",
          },
          full_page: {
            type: "boolean",
            description: "Capturar página completa (default false — só viewport).",
          },
          format: {
            type: "string",
            description: "Formato da imagem: png (default) ou jpg.",
          },
        },
        required: ["url"],
      },
    },
    async (args) => {
      try {
        const url = args.url as string;
        if (!url) {
          return {
            toolCallId: "",
            ok: false,
            error: "screenshot_capture requer 'url'",
            output: null,
          };
        }

        try {
          new URL(url);
        } catch {
          return {
            toolCallId: "",
            ok: false,
            error: `URL inválida: ${url}`,
            output: null,
          };
        }

        const width = (args.width as number) ?? 1280;
        const height = (args.height as number) ?? 720;
        const fullPage = (args.full_page as boolean) ?? false;
        const format = (args.format as string) ?? "png";
        const secrets = await getSecrets();

        // ScreenshotOne (com key) ou thum.io (gratuito fallback)
        const screenshotUrl = `https://api.screenshotone.com/take?url=${encodeURIComponent(url)}&viewport_width=${width}&viewport_height=${height}&full_page=${fullPage}&format=${format}&cache=true&cache_ttl=86400`;

        if (secrets["SCREENSHOTONE_API_KEY"]) {
          const authUrl = `${screenshotUrl}&access_key=${secrets["SCREENSHOTONE_API_KEY"]}`;
          const response = await fetch(authUrl, { method: "HEAD", signal: AbortSignal.timeout(10000) });
          if (response.ok) {
            return {
              toolCallId: "",
              ok: true,
              output: {
                screenshot_url: authUrl,
                width,
                height,
                format,
                provider: "screenshotone",
                url,
              },
            };
          }
        }

        // Fallback gratuito: thum.io
        const thumbUrl = `https://image.thum.io/get/width/${width}/crop/${height}/${url}`;
        return {
          toolCallId: "",
          ok: true,
          output: {
            screenshot_url: thumbUrl,
            width,
            height,
            format: "jpg",
            provider: "thum.io",
            url,
          },
        };
      } catch (err) {
        return {
          toolCallId: "",
          ok: false,
          error: `screenshot_capture falhou: ${(err as Error).message}`,
          output: null,
        };
      }
    },
  );
}
