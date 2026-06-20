import { createClient } from "npm:@supabase/supabase-js@2";
import { CATEGORY_PROMPTS, MASTER_EXTRACTION_PROMPT, type ExtractionCategory } from "./prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractInput {
  urls: string[];
  depth: "shallow" | "deep";
  categories?: ExtractionCategory[];
  projectId?: string;
  sandboxExecUrl?: string;
  sandboxToken?: string;
  /** LLM config do usuário (ou do admin, via tool) */
  llmApiKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
}

interface ExtractResult {
  dnas: Record<string, unknown>[];
  errors: { url: string; error: string }[];
  credits_used: number;
  library_ids: string[];
  screenshots: Record<string, string[]>;
}

interface LibraryEntry {
  name: string;
  source_url: string;
  category: string;
  extracted_by?: string;
  quality_score: number;
  quality_source: string;
  validated: boolean;
  raw_markdown: string;
  screenshot_url: string;
  screenshot_base64?: string;
  design_dna: Record<string, unknown> | null;
  serves_domains: string[];
  compatible_languages: string[];
  compatible_moods: string[];
  tags: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const input: ExtractInput = await req.json();
    if (!input.urls?.length || input.urls.length > 5) {
      return new Response(JSON.stringify({ error: "1-5 URLs required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const depth = input.depth ?? "shallow";
    const categories = input.categories ?? [
      "hero", "motion", "typography", "color_application", "components", "interactions",
    ];

    const result: ExtractResult = {
      dnas: [],
      errors: [],
      credits_used: 0,
      library_ids: [],
      screenshots: {},
    };

    const processor = depth === "deep" ? processDeep : processShallow;

    for (const url of input.urls) {
      try {
        const { dna, rawMarkdown, screenshotUrl, screenshots } = await processor(url, categories, input);
        if (screenshots && screenshots.length > 0) {
          result.screenshots[url] = screenshots.slice(0, 5);
        }
        if (dna) {
          const entry: LibraryEntry = {
            name: (dna.name as string) || url,
            source_url: url,
            category: (dna.category as string) || "full_page",
            quality_score: (dna.quality_score as number) || 5,
            quality_source: (dna.quality_source as string) || depth === "deep" ? "deep_extraction" : "shallow_extraction",
            validated: false,
            raw_markdown: rawMarkdown,
            screenshot_url: screenshotUrl,
            screenshot_base64: undefined,
            design_dna: {
              layout: dna.layout ?? null,
              color: dna.color ?? null,
              typography: dna.typography ?? null,
              motion: dna.motion ?? null,
              interaction: dna.interaction ?? null,
              component: dna.component ?? null,
              implementation_notes: dna.implementation_notes ?? null,
            },
            serves_domains: (dna.serves_domains as string[]) || [],
            compatible_languages: (dna.compatible_languages as string[]) || [],
            compatible_moods: (dna.compatible_moods as string[]) || [],
            tags: [categories.join(",")],
          };

          const { data: inserted, error: insertError } = await supabase
            .from("design_system_library")
            .insert(entry)
            .select("id")
            .single();

          if (insertError) {
            console.warn(`[extract-design-dna] Failed to persist to library: ${insertError.message}`);
          } else if (inserted) {
            result.library_ids.push((inserted as Record<string, unknown>).id as string);
          }

          result.dnas.push(dna);
          result.credits_used += depth === "deep" ? 3 : 1;
        }
      } catch (err) {
        result.errors.push({ url, error: (err as Error).message });
      }
    }

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Pipeline Shallow ────────────────────────────────────────────

async function processShallow(
  url: string,
  categories: ExtractionCategory[],
  input: ExtractInput,
): Promise<{ dna: Record<string, unknown> | null; rawMarkdown: string; screenshotUrl: string; screenshots?: string[] }> {
  const markdown = await fetchViaJina(url);
  const screenshotUrl = `https://image.thum.io/get/width/1280/crop/720/fullpage/${encodeURIComponent(url)}`;
  const dna = await llmExtractDNA(url, markdown, screenshotUrl, categories, false, input);

  return { dna, rawMarkdown: markdown, screenshotUrl };
}

// ── Pipeline Deep ────────────────────────────────────────────────

async function processDeep(
  url: string,
  categories: ExtractionCategory[],
  input: ExtractInput,
): Promise<{ dna: Record<string, unknown> | null; rawMarkdown: string; screenshotUrl: string; screenshots?: string[] }> {
  if (!input.sandboxExecUrl) {
    return processShallow(url, categories, input);
  }

  const playwrightData = await execPlaywrightInSandbox(url, input.sandboxExecUrl, input.sandboxToken);
  const enrichedMarkdown = [
    playwrightData.markdown,
    `\n\n## CSS Computado (sections principais)\n${playwrightData.css_computed}`,
    `\n\n## Motion Traces\n${playwrightData.motion_traces}`,
    playwrightData.color_scheme ? `\n\n## Color Scheme\n${playwrightData.color_scheme}` : "",
    playwrightData.page_height ? `\n\n## Page Metrics\n- Full page height: ${playwrightData.page_height}px` : "",
  ].join("");

  const screenshots = playwrightData.screenshots ?? [];
  const mainScreenshot = screenshots[0] ?? playwrightData.screenshot_base64 ?? "";

  const dna = await llmExtractDNA(
    url, enrichedMarkdown, mainScreenshot ? `data:image/png;base64,${mainScreenshot}` : "",
    categories, true, input,
  );

  return {
    dna,
    rawMarkdown: enrichedMarkdown,
    screenshotUrl: mainScreenshot ? `data:image/png;base64,${mainScreenshot}` : "",
    screenshots: screenshots.slice(0, 5),
  };
}

// ── Helpers ──────────────────────────────────────────────────────

async function fetchViaJina(url: string): Promise<string> {
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const response = await fetch(jinaUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Jina Reader failed: HTTP ${response.status}`);
    const data = await response.json();
    return data.data?.content || data.data?.text || "";
  } catch {
    return fetchViaHttp(url);
  }
}

async function fetchViaHttp(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "AetherForge/1.0 (design-dna-extraction)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP fetch failed: ${response.status}`);
  const html = await response.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50000);
}

async function execPlaywrightInSandbox(
  url: string,
  sandboxExecUrl: string,
  sandboxToken?: string,
): Promise<{
  markdown: string;
  css_computed: string;
  motion_traces: string;
  color_scheme?: string;
  screenshots?: string[];
  screenshot_base64?: string;
  page_height?: number;
}> {
  const { buildPlaywrightScript } = await import("./playwright-automation.ts");
  const script = buildPlaywrightScript(url);

  const response = await fetch(sandboxExecUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sandboxToken ? { Authorization: `Bearer ${sandboxToken}` } : {}),
    },
    body: JSON.stringify({ command: "node -e", stdin: script, timeout: 120000 }),
    signal: AbortSignal.timeout(150000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Sandbox exec failed: HTTP ${response.status} — ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  const result = JSON.parse(data.output || data.stdout || "{}");

  return {
    markdown: result.markdown ?? "",
    css_computed: result.css_computed ?? "[]",
    motion_traces: result.motion_traces ?? "[]",
    color_scheme: result.color_scheme ?? "{}",
    screenshots: result.screenshots ?? [],
    screenshot_base64: result.screenshots?.[0],
    page_height: result.page_height,
  };
}

async function llmExtractDNA(
  url: string,
  markdown: string,
  screenshot: string,
  categories: ExtractionCategory[],
  isDeep: boolean,
  input: ExtractInput,
): Promise<Record<string, unknown>> {
  const categoryInstructions = categories
    .map((cat) => `### Categoria: ${cat}\n${CATEGORY_PROMPTS[cat]}`)
    .join("\n\n---\n\n");

  const systemPrompt = `${MASTER_EXTRACTION_PROMPT}

## Modo: ${isDeep ? "DEEP (com CSS computado + motion traces)" : "SHALLOW (markdown + screenshot URL)"}

## Categorias a extrair
${categoryInstructions}

## IMPORTANTE
- Retorne UM JSON válido com todas as categorias combinadas
- layout, color, typography, motion, interaction, component como objects
- serves_domains, compatible_languages, compatible_moods como arrays
- quality_score: estime 0-10 baseado na riqueza de design observada
- Se não há evidência de algo, use null`;

  const userContent = `## Site: ${url}

### Markdown extraído:
${markdown.slice(0, 30000)}

### Screenshot: ${screenshot.startsWith("data:") ? "[imagem base64 anexada]" : screenshot}

Extraia o DesignDNA deste site.`;

  // Usa LLM config passada pelo usuário (via tool), FALLBACK para env vars
  const llmUrl = input.llmBaseUrl || Deno.env.get("LLM_BASE_URL") || "https://api.openai.com/v1";
  const llmKey = input.llmApiKey || Deno.env.get("LLM_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
  const llmModel = input.llmModel || Deno.env.get("LLM_MODEL") || "gpt-4o-mini";

  if (!llmKey) {
    return buildFallbackDna(url, "no LLM key available");
  }

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: screenshot.startsWith("data:")
        ? [
            { type: "text", text: userContent },
            { type: "image_url", image_url: { url: screenshot } },
          ]
        : userContent,
    },
  ];

  const response = await fetch(`${llmUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmKey}`,
    },
    body: JSON.stringify({
      model: llmModel,
      messages,
      max_tokens: 4096,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) throw new Error(`LLM extraction failed: HTTP ${response.status}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

  return {
    name: url,
    source_url: url,
    category: "full_page",
    serves_domains: (parsed.serves_domains as string[]) || [],
    compatible_languages: (parsed.compatible_languages as string[]) || [],
    compatible_moods: (parsed.compatible_moods as string[]) || [],
    layout: parsed.layout ?? null,
    color: parsed.color ?? null,
    typography: parsed.typography ?? null,
    motion: parsed.motion ?? null,
    interaction: parsed.interaction ?? null,
    component: parsed.component ?? null,
    implementation_notes: parsed.implementation_notes ?? null,
    quality_score: Math.min(10, Math.max(0, (parsed.quality_score as number) ?? (isDeep ? 7 : 5))),
    quality_source: isDeep ? "deep_extraction" : "shallow_extraction",
    extracted_at: new Date().toISOString(),
    validated: false,
  };
}

function buildFallbackDna(url: string, reason: string): Record<string, unknown> {
  return {
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
    implementation_notes: `Partial extraction — ${reason}`,
    quality_score: 3,
    quality_source: `heuristic (${reason})`,
    extracted_at: new Date().toISOString(),
    validated: false,
  };
}
