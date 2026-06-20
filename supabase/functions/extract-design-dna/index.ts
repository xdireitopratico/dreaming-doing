/**
 * extract-design-dna — Edge Function que encapsula o pipeline completo
 * de extração de DesignDNA de URLs de referência.
 *
 * Modos:
 * - shallow (grátis, edge): HTTP + Jina Reader + thum.io → LLM especialista → DesignDNA parcial
 * - deep (pago, sandbox): Playwright no sandbox E2B → CSS computado + motion traces → DesignDNA completo
 *
 * O agente chama esta tool no Plan mode (shallow) ou Build mode (deep).
 * O resultado é auto-adicionado ao DesignDNAStore para uso futuro.
 */

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
  /** Para deep: sandbox exec endpoint + token */
  sandboxExecUrl?: string;
  sandboxToken?: string;
  /** LLM config para especialista */
  llmProvider?: string;
  llmApiKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
}

interface ExtractResult {
  dnas: Record<string, unknown>[];
  errors: { url: string; error: string }[];
  credits_used: number;
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
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    };

    // Processa URLs em paralelo (shallow) ou sequencial (deep — sandbox é single-threaded)
    const processor = depth === "deep" ? processDeep : processShallow;

    for (const url of input.urls) {
      try {
        const dna = await processor(url, categories, input);
        if (dna) {
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

// ── Pipeline Shallow (grátis, edge) ──────────────────────────────

async function processShallow(
  url: string,
  categories: ExtractionCategory[],
  _input: ExtractInput,
): Promise<Record<string, unknown> | null> {
  // 1. Extrai markdown via Jina Reader (grátis)
  const markdown = await fetchViaJina(url);

  // 2. Captura screenshot via thum.io (grátis)
  const screenshotUrl = `https://image.thum.io/get/width/1280/crop/720/fullpage/${encodeURIComponent(url)}`;

  // 3. LLM especialista analisa markdown + screenshot URL
  const dna = await llmExtractDNA(url, markdown, screenshotUrl, categories, false);

  return dna;
}

// ── Pipeline Deep (pago, sandbox) ────────────────────────────────

async function processDeep(
  url: string,
  categories: ExtractionCategory[],
  input: ExtractInput,
): Promise<Record<string, unknown> | null> {
  if (!input.sandboxExecUrl) {
    // Fallback para shallow se sandbox não disponível
    return processShallow(url, categories, input);
  }

  // 1. Executa script Playwright no sandbox
  const playwrightData = await execPlaywrightInSandbox(url, input.sandboxExecUrl, input.sandboxToken);

  // 2. Combina markdown + playwright data (CSS computado, motion traces, screenshots base64)
  const enrichedMarkdown = `${playwrightData.markdown}\n\n## CSS Computed\n${playwrightData.css_computed}\n\n## Motion Traces\n${playwrightData.motion_traces}`;

  // 3. LLM especialista analisa tudo → DesignDNA completo
  const dna = await llmExtractDNA(url, enrichedMarkdown, playwrightData.screenshot_base64, categories, true);

  return dna;
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
  } catch (err) {
    // Fallback: HTTP direto
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
): Promise<{ markdown: string; css_computed: string; motion_traces: string; screenshot_base64?: string }> {
  const script = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('${url.replace(/'/g, "\\'")}', { waitUntil: 'networkidle', timeout: 30000 });

  // CSS computado do hero
  const heroStyles = await page.evaluate(() => {
    const hero = document.querySelector('section, header, [class*="hero"]') || document.body;
    const cs = window.getComputedStyle(hero);
    return JSON.stringify({
      display: cs.display,
      gridTemplateColumns: cs.gridTemplateColumns,
      padding: cs.padding,
      background: cs.background.slice(0, 500),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
    }, null, 2);
  });

  // Motion traces
  const motionData = await page.evaluate(() => {
    const els = document.querySelectorAll('[class*="animate"], [class*="transition"], [class*="parallax"], [class*="reveal"]');
    const traces = [];
    els.forEach((el, i) => {
      if (i >= 10) return;
      const cs = window.getComputedStyle(el);
      traces.push({
        class: el.className.slice(0, 100),
        transition: cs.transition,
        animation: cs.animation.slice(0, 200),
        transform: cs.transform,
      });
    });
    return JSON.stringify(traces, null, 2);
  });

  // Screenshot
  const screenshot = await page.screenshot({ fullPage: false, type: 'png' });
  const base64 = screenshot.toString('base64');

  // Markdown simples
  const text = await page.evaluate(() => document.body.innerText.slice(0, 10000));

  await browser.close();

  process.stdout.write(JSON.stringify({
    markdown: text,
    css_computed: heroStyles,
    motion_traces: motionData,
    screenshot_base64: base64,
  }));
})();
`;

  const response = await fetch(sandboxExecUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sandboxToken ? { Authorization: `Bearer ${sandboxToken}` } : {}),
    },
    body: JSON.stringify({
      command: "node -e",
      stdin: script,
      timeout: 45000,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) throw new Error(`Sandbox exec failed: HTTP ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.output || data.stdout || "{}");
}

async function llmExtractDNA(
  url: string,
  markdown: string,
  screenshot: string,
  categories: ExtractionCategory[],
  isDeep: boolean,
): Promise<Record<string, unknown>> {
  // Constrói prompt combinando categorias solicitadas
  const categoryInstructions = categories
    .map((cat) => `### Categoria: ${cat}\n${CATEGORY_PROMPTS[cat]}`)
    .join("\n\n---\n\n");

  const systemPrompt = `${MASTER_EXTRACTION_PROMPT}

## Modo: ${isDeep ? "DEEP (com CSS computado + motion traces)" : "SHALLOW (markdown + screenshot URL)"}

## Categorias a extrair
${categoryInstructions}

## IMPORTANTE
- Retorne UM JSON válido com todas as categorias combinadas
- Se não há evidência de algo, use null ou omita
- quality_score: estime 0-10 baseado na riqueza de design observada`;

  const userContent = `## Site: ${url}

### Markdown extraído:
${markdown.slice(0, 30000)}

### Screenshot: ${screenshot.startsWith("data:") ? "[imagem base64 anexada]" : screenshot}

Extraia o DesignDNA deste site.`;

  // Chama LLM (usando config do env ou fallback)
  const llmUrl = Deno.env.get("LLM_BASE_URL") || "https://api.openai.com/v1";
  const llmKey = Deno.env.get("LLM_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
  const llmModel = Deno.env.get("LLM_MODEL") || "gpt-4o-mini";

  if (!llmKey) {
    // Sem LLM — retorna DNA parcial do markdown (heurístico)
    return {
      id: `extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: url,
      source_url: url,
      category: "full_page",
      serves_domains: [],
      compatible_languages: [],
      compatible_moods: [],
      layout: { type: "unknown (extraction without LLM)" },
      implementation_notes: "Partial extraction — no LLM configured for specialist analysis",
      quality_score: 3,
      quality_source: "heuristic (no LLM)",
      extracted_at: new Date().toISOString(),
      validated: false,
    };
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
    // Tenta extrair JSON do texto
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

  // Adiciona metadata
  return {
    id: `extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: url,
    source_url: url,
    category: "full_page",
    serves_domains: [],
    compatible_languages: [],
    compatible_moods: [],
    ...parsed,
    quality_score: parsed.quality_score ?? (isDeep ? 7 : 5),
    quality_source: isDeep ? "heuristic (deep extraction)" : "heuristic (shallow extraction)",
    extracted_at: new Date().toISOString(),
    validated: false,
  };
}
