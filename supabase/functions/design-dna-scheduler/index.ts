/**
 * design-dna-scheduler — Cron semanal para extração contínua de DesignDNA.
 *
 * Invocado por pg_cron toda segunda 06h UTC.
 * Processa até 5 sites semanais de fontes curadas (Awwwards, FWA, Godly, etc.)
 * Usa extração shallow (gratuita, edge) — sem sandbox.
 * Armazena resultados na tabela design_dna.
 *
 * @version 1.0.0
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Fontes curadas de sites de design de alta qualidade */
const CURATED_SOURCES = [
  // Awwwards winners (atualiza todo mês)
  { name: "Awwwards", url: "https://www.awwwards.com/websites/", type: "aggregator" as const },
  { name: "FWA", url: "https://thefwa.com/", type: "aggregator" as const },
  { name: "Godly", url: "https://godly.website/", type: "aggregator" as const },
  { name: "Mobbin", url: "https://mobbin.com/browse/ios/apps", type: "aggregator" as const },
  { name: "SiteInspire", url: "https://www.siteinspire.com/", type: "aggregator" as const },
  // Sites seminalmente premiados (rotacionados)
  { name: "Bruno Simon", url: "https://bruno-simon.com/", type: "direct" as const },
  { name: "Locomotive", url: "https://locomotive.ca/", type: "direct" as const },
  { name: "Cuberto", url: "https://cuberto.com/", type: "direct" as const },
  { name: "Hello Monday", url: "https://www.hellomonday.com/", type: "direct" as const },
  { name: "Active Theory", url: "https://activetheory.com/", type: "direct" as const },
  { name: "Ryoji Ikeda", url: "https://www.ryojiikeda.com/", type: "direct" as const },
  { name: "DRIBBBLE", url: "https://dribbble.com/tags/landing_page", type: "aggregator" as const },
  { name: "Behance", url: "https://www.behance.net/search/projects?search=landing+page", type: "aggregator" as const },
  { name: "CSS Design Awards", url: "https://www.cssdesignawards.com/", type: "aggregator" as const },
  { name: "Awwwards Nominees", url: "https://www.awwwards.com/websites/nominees/", type: "aggregator" as const },
];

/** Sites processados nesta run — rotaciona para não repetir todo mês */
const SITES_PER_RUN = 5;

// ── Categorias de extração ──────────────────────────────────────

type ExtractionCategory = "hero" | "motion" | "typography" | "color_application" | "components" | "interactions";

const CATEGORIES: ExtractionCategory[] = [
  "hero", "motion", "typography", "color_application", "components", "interactions",
];

// ── Main handler ────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const results = {
    sources_processed: 0,
    dnas_extracted: 0,
    dnas_upserted: 0,
    errors: [] as string[],
    started_at: new Date().toISOString(),
  };

  try {
    // 1. Determina quais sites processar nesta run (rotaciona baseado na semana)
    const weekOffset = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
    const batch = getBatchForWeek(weekOffset, SITES_PER_RUN);

    results.sources_processed = batch.length;

    // 2. Extrai DNA de cada site (shallow — edge-friendly)
    for (const source of batch) {
      try {
        const dna = await extractSingleSource(source, supabase);
        if (dna && dna.quality_score >= 3) {
          // Upsert via service_role
          const { error } = await supabase
            .from("design_dna")
            .upsert(dna, { onConflict: "id" });

          if (error) {
            results.errors.push(`${source.name}: upsert failed — ${error.message}`);
          } else {
            results.dnas_upserted++;
          }
        }
        results.dnas_extracted++;
      } catch (err) {
        results.errors.push(`${source.name}: ${(err as Error).message}`);
      }
    }

    // 3. Log
    console.log("[design-dna-scheduler] Done:", JSON.stringify(results));

    return new Response(JSON.stringify({ ok: true, ...results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[design-dna-scheduler] Fatal:", err);
    return new Response(JSON.stringify({ error: "Internal error", ...results }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Batch Rotation ──────────────────────────────────────────────

function getBatchForWeek(weekOffset: number, count: number) {
  const shuffled = [...CURATED_SOURCES];
  // Rotaciona deterministicamente baseado na semana
  const shift = weekOffset % shuffled.length;
  const rotated = [...shuffled.slice(shift), ...shuffled.slice(0, shift)];
  // Pega os primeiros `count`, priorizando agregadores que listam sites novos
  const aggregators = rotated.filter((s) => s.type === "aggregator");
  const directs = rotated.filter((s) => s.type === "direct");
  const batch = [
    ...aggregators.slice(0, Math.min(2, count)),
    ...directs.slice(0, count - 2),
  ];
  return batch.slice(0, count);
}

// ── Single Source Extraction ────────────────────────────────────

async function extractSingleSource(
  source: { name: string; url: string; type: string },
  supabase: ReturnType<typeof createClient>,
) {
  // 1. Se for agregador, extrai URLs dos sites em destaque
  const urlsToExtract = source.type === "aggregator"
    ? await extractFeaturedUrls(source.url, supabase)
    : [source.url];

  if (urlsToExtract.length === 0) return null;

  // 2. Para cada URL, faz shallow extraction via pipeline
  const dnas = [];
  for (const siteUrl of urlsToExtract.slice(0, 3)) {
    try {
      const html = await fetchSiteContent(siteUrl);
      if (!html) continue;

      const markdown = htmlToMarkdown(html);
      const screenshotUrl = `https://image.thum.io/get/width/1280/crop/720/fullpage/${encodeURIComponent(siteUrl)}`;

      const dna = await callLlmExtraction(siteUrl, markdown, screenshotUrl);
      if (dna) dnas.push(dna);
    } catch {
      // skip — não quebra o batch por um site
    }
  }

  return dnas.length > 0 ? dnas[0] : null;
}

// ── Featured URL Extraction ─────────────────────────────────────

async function extractFeaturedUrls(
  aggregatorUrl: string,
  _supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  try {
    const html = await fetchSiteContent(aggregatorUrl);
    if (!html) return [];

    // Regex simples para extrair links de sites (não do próprio agregador)
    const urlRegex = /https?:\/\/[^\s"'>]+/g;
    const matches = html.match(urlRegex) || [];

    // Filtra URLs únicas que parecem sites de portfólio (não agregadores)
    const uniqueUrls = [...new Set(matches)]
      .filter((u) => {
        try {
          const host = new URL(u).hostname;
          return !host.includes("awwwards") &&
            !host.includes("fwa") &&
            !host.includes("godly") &&
            !host.includes("mobbin") &&
            !host.includes("siteinspire") &&
            !host.includes("dribbble") &&
            !host.includes("behance") &&
            !host.includes("cssdesignawards") &&
            !host.includes("google") &&
            !host.includes("facebook") &&
            !host.includes("twitter") &&
            !host.includes("instagram") &&
            !host.includes("linkedin") &&
            !host.includes("youtube");
        } catch {
          return false;
        }
      })
      .slice(0, 5);

    return uniqueUrls;
  } catch {
    return [];
  }
}

// ── Content Fetch ───────────────────────────────────────────────

async function fetchSiteContent(url: string): Promise<string | null> {
  try {
    // Tenta Jina Reader primeiro (grátis, markdown estruturado)
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const response = await fetch(jinaUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });

    if (response.ok) {
      const data = await response.json();
      return data.data?.content || data.data?.text || null;
    }
  } catch {
    // fallback
  }

  // Fallback: HTTP direto
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "AetherForge/1.0 (design-dna-scheduler)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

// ── HTML to Markdown (simplificado) ─────────────────────────────

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30000);
}

// ── LLM Extraction ──────────────────────────────────────────────

async function callLlmExtraction(
  url: string,
  markdown: string,
  screenshotUrl: string,
): Promise<Record<string, unknown> | null> {
  const llmUrl = Deno.env.get("LLM_BASE_URL") || "https://api.openai.com/v1";
  const llmKey = Deno.env.get("LLM_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
  const llmModel = Deno.env.get("LLM_MODEL") || "gpt-4o-mini";

  if (!llmKey) {
    return buildFallbackDna(url);
  }

  const systemPrompt = `You are a DesignDNA extraction specialist. Analyze the markdown content and screenshot to extract design DNA elements.

## Categories to extract
- hero: Layout, headline style, visual hierarchy
- motion: Animations, transitions, scroll effects
- typography: Font choices, sizes, weights, hierarchy, letter-spacing
- color_application: Primary palette, accents, gradients, backgrounds
- components: Card patterns, buttons, navigation, form elements
- interactions: Hover states, click feedback, micro-interactions

## Output format
Return a JSON object with this structure:
{
  "quality_score": number 0-10,
  "layout": { "type": string, "grid": string|null, "hero_style": string|null },
  "color": { "primary": string|null, "secondary": string|null, "accent": string|null, "background": string|null, "gradient": string|null },
  "typography": { "heading_font": string|null, "body_font": string|null, "scale": string|null, "heading_weight": string|null },
  "motion": { "has_parallax": boolean, "has_reveal": boolean, "has_stagger": boolean, "transition_style": string|null },
  "interaction": { "hover_effect": string|null, "click_feedback": string|null, "cursor_custom": boolean },
  "component": { "card_style": string|null, "button_style": string|null, "nav_style": string|null },
  "serves_domains": string[],
  "compatible_moods": string[],
  "compatible_languages": string[]
}`;

  const response = await fetch(`${llmUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmKey}`,
    },
    body: JSON.stringify({
      model: llmModel,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: `Site: ${url}\n\nContent:\n${markdown.slice(0, 20000)}` },
            { type: "image_url", image_url: { url: screenshotUrl } },
          ],
        },
      ],
      max_tokens: 2048,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) return buildFallbackDna(url);

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";

  try {
    const parsed = JSON.parse(content);
    return {
      id: `scheduled-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: url,
      source_url: url,
      category: "full_page",
      serves_domains: parsed.serves_domains || [],
      compatible_languages: parsed.compatible_languages || [],
      compatible_moods: parsed.compatible_moods || [],
      layout: parsed.layout || null,
      color: parsed.color || null,
      typography: parsed.typography || null,
      motion: parsed.motion || null,
      interaction: parsed.interaction || null,
      component: parsed.component || null,
      quality_score: Math.min(10, Math.max(0, parsed.quality_score || 5)),
      quality_source: "shallow extraction (scheduler)",
      extracted_at: new Date().toISOString(),
      validated: false,
    };
  } catch {
    return buildFallbackDna(url);
  }
}

function buildFallbackDna(url: string): Record<string, unknown> {
  return {
    id: `scheduled-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: url,
    source_url: url,
    category: "full_page",
    serves_domains: [],
    compatible_languages: [],
    compatible_moods: [],
    layout: { type: "unknown" },
    color: null,
    typography: null,
    motion: null,
    interaction: null,
    component: null,
    quality_score: 3,
    quality_source: "heuristic (no LLM available)",
    extracted_at: new Date().toISOString(),
    validated: false,
  };
}
