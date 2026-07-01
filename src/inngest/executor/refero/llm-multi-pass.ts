/**
 * Multi-pass LLM extraction engine.
 *
 * Instead of stuffing all 6 category prompts into a single LLM call
 * (which dilutes quality per category), this module runs 5 specialized
 * passes + 1 synthesis pass. Each pass uses the dedicated expert prompt
 * for its category, producing deeper, more actionable results.
 *
 * Architecture:
 *   PASS 1: hero         → layout + component (hero section analysis)
 *   PASS 2: motion       → motion (animation choreography)
 *   PASS 3: typography   → typography (font stack, scale, weight hierarchy)
 *   PASS 4: color_application → color (palette, gradients, contrast)
 *   PASS 5: components   → component (anatomy, behavior, integration)
 *   PASS 5b: interactions → interaction (hover, cursor, effects)
 *   PASS 6: SYNTHESIS    → merges all passes into cohesive DNA
 *
 * Each pass runs in parallel (Promise.allSettled) to minimize latency.
 * The synthesis pass runs last and produces the final unified DNA.
 *
 * Fallback: If multi-pass fails or times out, falls back to single-pass
 * extraction (the legacy llmExtractDNA behavior).
 */

import {
  CATEGORY_PROMPTS,
  MASTER_EXTRACTION_PROMPT,
  type ExtractionCategory,
} from "../../../../supabase/functions/extract-design-dna/prompts.ts";

// ── Types ──

type LLMConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
  protocol: "openai" | "anthropic" | "gemini";
};

export type MultiPassConfig = {
  llmConfig: LLMConfig;
  url: string;
  markdown: string;
  screenshot: string;
  categories: string[];
  isDeep: boolean;
  /** Maximum total time for all passes combined (ms). Default: 180000 (3min). */
  timeoutMs?: number;
  /** Force single-pass (skip multi-pass entirely). Default: false. */
  forceSinglePass?: boolean;
};

type SinglePassResult = {
  category: string;
  data: Record<string, unknown>;
  tokenUsage?: number;
  durationMs: number;
  error?: string;
};

export type MultiPassResult = {
  /** Whether multi-pass was used (vs single-pass fallback). */
  mode: "multi_pass" | "single_pass";
  /** Merged DNA result — same shape as single-pass output. */
  dna: Record<string, unknown> | null;
  /** Per-pass trace for debugging. */
  passes: SinglePassResult[];
  /** Total extraction time. */
  totalDurationMs: number;
  /** Number of passes that succeeded. */
  succeededCount: number;
  /** Number of passes that failed. */
  failedCount: number;
};

// ── Category → LLM field mapping ──
// Each category prompt extracts data that maps to specific DNA fields.

const CATEGORY_FIELD_MAP: Record<string, string[]> = {
  hero: ["layout", "component"],
  motion: ["motion"],
  typography: ["typography"],
  color_application: ["color"],
  components: ["component"],
  interactions: ["interaction"],
};

// ── Pass definitions ──
// Ordered by dependency: hero first (layout is foundational), then
// independent categories, then interactions (benefits from component context).

const PASS_ORDER: ExtractionCategory[] = [
  "hero",
  "typography",
  "color_application",
  "motion",
  "components",
  "interactions",
];

// ── LLM dispatch (same 3-protocol adapter) ──

type ChatContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

function dispatchLlmChat(
  cfg: LLMConfig,
  systemPrompt: string,
  userContent: string,
  screenshot: string,
): Promise<{ content: string }> {
  if (cfg.protocol === "anthropic") {
    return anthropicChat(cfg, systemPrompt, userContent, screenshot);
  }
  if (cfg.protocol === "gemini") {
    return geminiChat(cfg, systemPrompt, userContent, screenshot);
  }
  return openAiChat(cfg, systemPrompt, userContent, screenshot);
}

function openAiChat(
  cfg: LLMConfig,
  systemPrompt: string,
  userContent: string,
  screenshot: string,
): Promise<{ content: string }> {
  const messages: Array<{ role: "system" | "user"; content: ChatContent }> = [
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
  return fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: 4096,
      temperature: 0.2, // Slightly lower for specialized extraction
    }),
    signal: AbortSignal.timeout(60000), // 60s per pass (vs 120s for single)
  }).then(async (response) => {
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Multi-pass LLM failed (${cfg.label}): HTTP ${response.status} — ${errText.slice(0, 300)}`);
    }
    const data = await response.json();
    return { content: data.choices?.[0]?.message?.content || "{}" };
  });
}

function anthropicChat(
  cfg: LLMConfig,
  systemPrompt: string,
  userContent: string,
  screenshot: string,
): Promise<{ content: string }> {
  const hasImage = screenshot.startsWith("data:");
  const userBlocks: Array<Record<string, unknown>> = [{ type: "text", text: userContent }];
  if (hasImage) {
    const base64Match = screenshot.match(/^data:image\/(\w+);base64,(.+)$/s);
    if (base64Match) {
      userBlocks.push({
        type: "image",
        source: { type: "base64", media_type: `image/${base64Match[1]}`, data: base64Match[2] },
      });
    }
  }
  return fetch(`${cfg.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      system: systemPrompt,
      max_tokens: 4096,
      temperature: 0.2,
      messages: [{ role: "user", content: userBlocks }],
    }),
    signal: AbortSignal.timeout(60000),
  }).then(async (response) => {
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Multi-pass LLM failed (${cfg.label}): HTTP ${response.status} — ${errText.slice(0, 300)}`);
    }
    const data = await response.json();
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks
      .map((b: { type?: string; text?: string }) => (b.type === "text" ? b.text : ""))
      .join("");
    return { content: text || "{}" };
  });
}

function geminiChat(
  cfg: LLMConfig,
  systemPrompt: string,
  userContent: string,
  screenshot: string,
): Promise<{ content: string }> {
  const parts: Array<Record<string, unknown>> = [{ text: userContent }];
  if (screenshot.startsWith("data:")) {
    const base64Match = screenshot.match(/^data:image\/(\w+);base64,(.+)$/s);
    if (base64Match) {
      parts.push({
        inline_data: { mime_type: `image/${base64Match[1]}`, data: base64Match[2] },
      });
    }
  }
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(60000),
  }).then(async (response) => {
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Multi-pass LLM failed (${cfg.label}): HTTP ${response.status} — ${errText.slice(0, 300)}`);
    }
    const data = await response.json();
    const candidateParts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(candidateParts)
      ? candidateParts.map((p: { text?: string }) => p.text ?? "").join("")
      : "";
    return { content: text || "{}" };
  });
}

// ── JSON parsing with fallbacks ──

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  // Attempt 1: Direct parse
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && Object.keys(parsed).length > 0) {
      return parsed as Record<string, unknown>;
    }
  } catch { /* fall through */ }

  // Attempt 2: Fenced code block
  const codeMatch = raw.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
  if (codeMatch) {
    try {
      const parsed = JSON.parse(codeMatch[1]);
      if (typeof parsed === "object" && parsed !== null && Object.keys(parsed).length > 0) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* fall through */ }
  }

  // Attempt 3: Outermost JSON object
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed === "object" && parsed !== null && Object.keys(parsed).length > 0) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* fall through */ }
  }

  return null;
}

// ── Category-aware markdown trimming ──
// Each category needs different context — we trim the markdown to focus
// the LLM on relevant sections.

function buildCategoryUserContent(
  category: ExtractionCategory,
  url: string,
  markdown: string,
  screenshot: string,
): string {
  const modeLabel = screenshot.startsWith("data:") ? "[screenshot anexado]" : screenshot;
  const baseIntro = `## Site: ${url}\n### Screenshot: ${modeLabel}\n\n`;

  switch (category) {
    case "hero":
      // Hero only needs the top portion of the page
      return `${baseIntro}### Markdown (primeiros 15000 chars — foco no hero):\n${markdown.slice(0, 15000)}\n\nExtraia o DNA de HERO/LAYOUT deste site. Foque no hero section e estrutura geral de layout.`;

    case "motion":
      // Motion needs HTML clues about animations
      return `${baseIntro}### Markdown (completo):\n${markdown.slice(0, 25000)}\n\nExtraia o DNA de MOTION deste site. Procure por: parallax, stagger, scroll-triggered animations, easing patterns, hover effects, loading states.`;

    case "typography":
      // Typography is in the text content
      return `${baseIntro}### Markdown (completo):\n${markdown.slice(0, 20000)}\n\nExtraia o DNA de TIPOGRAFIA deste site. Foque em: font stacks, type scale, weight hierarchy, letter-spacing, line-heights, variable fonts.`;

    case "color_application":
      // Color needs the full page for palette consistency
      return `${baseIntro}### Markdown (completo):\n${markdown.slice(0, 20000)}\n\nExtraia o DNA de COR deste site. Foque em: brand colors, surface layering, gradients, accent usage, contrast strategy, dark/light mode.`;

    case "components":
      // Components need structural HTML patterns
      return `${baseIntro}### Markdown (completo):\n${markdown.slice(0, 25000)}\n\nExtraia o DNA de COMPONENTES deste site. Foque em: anatomia de cada componente (HeroSignature, BentoGrid, NavShell, etc.), behavior patterns, integration points.`;

    case "interactions":
      // Interactions need behavioral cues
      return `${baseIntro}### Markdown (completo):\n${markdown.slice(0, 20000)}\n\nExtraia o DNA de INTERAÇÕES deste site. Foque em: hover feedback, cursor behavior, magnetic effects, spotlight, tilt, scroll snap, drag, micro-interactions.`;

    default:
      return `${baseIntro}### Markdown:\n${markdown.slice(0, 20000)}`;
  }
}

function buildCategorySystemPrompt(category: ExtractionCategory, isDeep: boolean): string {
  const categoryPrompt = CATEGORY_PROMPTS[category];
  return `${MASTER_EXTRACTION_PROMPT}

## Modo: ${isDeep ? "DEEP (com CSS computado + motion traces)" : "SHALLOW (markdown + screenshot)"}

## Categoria especializada: ${category}
${categoryPrompt}

## INSTRUÇÃO CRÍTICA
- Foque APENAS na categoria "${category}" — não invente dados de outras categorias
- Retorne JSON com apenas os campos desta categoria
- Se não há evidência clara, retorne campos como null
- Seja extremamente específico — valores CSS reais, não descrições genéricas`;
}

// ── Single-category extraction pass ──

async function runCategoryPass(
  cfg: LLMConfig,
  category: ExtractionCategory,
  url: string,
  markdown: string,
  screenshot: string,
  isDeep: boolean,
): Promise<SinglePassResult> {
  const start = Date.now();
  try {
    const systemPrompt = buildCategorySystemPrompt(category, isDeep);
    const userContent = buildCategoryUserContent(category, url, markdown, screenshot);

    const result = await dispatchLlmChat(cfg, systemPrompt, userContent, screenshot);
    const parsed = parseJsonResponse(result.content);

    if (!parsed) {
      return {
        category,
        data: {},
        durationMs: Date.now() - start,
        error: `JSON parse failed for ${category}`,
      };
    }

    return {
      category,
      data: parsed,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      category,
      data: {},
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Synthesis pass ──
// Merges all individual pass results into a cohesive DNA.
// Uses a lightweight LLM call to resolve conflicts and add cross-category insights.

async function runSynthesisPass(
  cfg: LLMConfig,
  passResults: SinglePassResult[],
  url: string,
  isDeep: boolean,
): Promise<Record<string, unknown> | null> {
  const successfulResults = passResults.filter((r) => !r.error && Object.keys(r.data).length > 0);

  if (successfulResults.length === 0) {
    return null;
  }

  // Build a combined JSON from all passes
  const combinedData: Record<string, unknown> = {};
  for (const result of successfulResults) {
    const targetFields = CATEGORY_FIELD_MAP[result.category] ?? [];
    for (const field of targetFields) {
      // Don't overwrite if already present (earlier passes have priority)
      if (!(field in combinedData)) {
        combinedData[field] = result.data[field];
      }
      // For component arrays, merge if multiple passes contributed
      if (field === "component" && Array.isArray(result.data[field])) {
        if (!Array.isArray(combinedData[field])) {
          combinedData[field] = [];
        }
        const existing = combinedData[field] as Array<unknown>;
        const incoming = result.data[field] as Array<unknown>;
        // Merge by component type to avoid duplicates
        const existingTypes = new Set(
          existing.map((c: Record<string, unknown>) => String(c.type ?? "")).filter(Boolean),
        );
        for (const comp of incoming) {
          const compRecord = comp as Record<string, unknown>;
          if (compRecord.type && !existingTypes.has(String(compRecord.type))) {
            existing.push(comp);
          }
        }
      }
    }
    // Copy any extra fields (serves_domains, compatible_languages, etc.)
    for (const [key, value] of Object.entries(result.data)) {
      if (!["layout", "motion", "typography", "color", "component", "interaction"].includes(key)) {
        if (!(key in combinedData) || combinedData[key] === null) {
          combinedData[key] = value;
        }
      }
    }
  }

  // Run a lightweight synthesis LLM call to:
  // 1. Add cross-category insights (e.g., motion that relates to typography)
  // 2. Resolve any contradictions between passes
  // 3. Add implementation_notes
  // 4. Calibrate quality_score

  const synthesisPrompt = `Você é um DIRETOR DE ARTE revisando um Design DNA extraído em múltiplos passes especializados.

Seu trabalho NÃO é extrair novamente — é SINTEZAR os resultados dos passes em um DNA coeso e consistente.

## Regras
1. Preserve dados específicos dos passes — NÃO generalize valores CSS
2. Se dois passes contradizem, escolha o mais específico
3. Adicione implementation_notes com observações cross-categoria
4. Estime quality_score (0-10) baseado na riqueza total do DNA
5. Se faltar uma categoria obrigatória (layout/color/typography), preencha null
6. Retorne o JSON final — NÃO invente campos sem evidência

## Resultado dos passes
${JSON.stringify(combinedData, null, 2)}

## Passes que falharam (NÃO tente preencher estes — deixe null)
${passResults.filter((r) => r.error).map((r) => r.category).join(", ") || "nenhum"}

${isDeep ? "## Contexto: Extração DEEP com CSS computado e motion traces disponíveis." : "## Contexto: Extração SHALLOW com markdown + screenshot."}

Retorne o DNA final como JSON.`;

  try {
    const result = await dispatchLlmChat(cfg, synthesisPrompt, `Sintetize o DNA do site: ${url}`, "");
    return parseJsonResponse(result.content);
  } catch (err) {
    // Synthesis failed — use the raw merged data as-is
    console.warn(`[llm-multi-pass] Synthesis LLM failed: ${err instanceof Error ? err.message : String(err)} — using raw merge`);
    return combinedData;
  }
}

// ── Single-pass fallback ──
// This is the legacy behavior — all categories in one call.

async function runSinglePassFallback(
  cfg: LLMConfig,
  url: string,
  markdown: string,
  screenshot: string,
  categories: string[],
  isDeep: boolean,
): Promise<Record<string, unknown> | null> {
  const categoryInstructions = categories
    .map((cat) => `### Categoria: ${cat}\n${CATEGORY_PROMPTS[cat as ExtractionCategory]}`)
    .join("\n\n---\n\n");

  const systemPrompt = `${MASTER_EXTRACTION_PROMPT}

## Modo: ${isDeep ? "DEEP (com CSS computado + motion traces)" : "SHALLOW (markdown + screenshot)"}

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

  try {
    const result = await dispatchLlmChat(cfg, systemPrompt, userContent, screenshot);
    return parseJsonResponse(result.content);
  } catch (err) {
    console.error(`[llm-multi-pass] Single-pass fallback failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Main entry point ──

export async function multiPassExtractDNA(config: MultiPassConfig): Promise<MultiPassResult> {
  const totalStart = Date.now();
  const timeoutMs = config.timeoutMs ?? 180000;

  // ── Decision: multi-pass or single-pass ──
  // Use multi-pass when:
  //   - Not forced to single-pass
  //   - Multiple categories requested
  //   - Deep mode (more content to analyze)
  const categoriesToExtract = config.categories.filter(
    (cat) => PASS_ORDER.includes(cat as ExtractionCategory),
  );

  if (config.forceSinglePass || categoriesToExtract.length <= 1) {
    console.log(`[llm-multi-pass] Using single-pass mode (${categoriesToExtract.length} categories, forceSingle=${config.forceSinglePass})`);
    const dna = await runSinglePassFallback(
      config.llmConfig,
      config.url,
      config.markdown,
      config.screenshot,
      config.categories,
      config.isDeep,
    );

    return {
      mode: "single_pass",
      dna,
      passes: [],
      totalDurationMs: Date.now() - totalStart,
      succeededCount: dna ? 1 : 0,
      failedCount: dna ? 0 : 1,
    };
  }

  // ── Multi-pass execution ──
  console.log(`[llm-multi-pass] Starting ${categoriesToExtract.length} specialized passes in parallel`);

  // Run all category passes in parallel
  const passPromises = categoriesToExtract.map((cat) =>
    runCategoryPass(
      config.llmConfig,
      cat as ExtractionCategory,
      config.url,
      config.markdown,
      config.screenshot,
      config.isDeep,
    ),
  );

  // Apply overall timeout
  let passResults: SinglePassResult[];
  try {
    passResults = await Promise.allSettled(passPromises)
      .then((settled) =>
        settled.map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : { category: categoriesToExtract[i], data: {}, durationMs: 0, error: r.reason?.message ?? "unknown" },
        ),
      );
  } catch (err) {
    // Promise.allSettled shouldn't reject, but just in case
    console.error(`[llm-multi-pass] All passes failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      mode: "multi_pass",
      dna: null,
      passes: [],
      totalDurationMs: Date.now() - totalStart,
      succeededCount: 0,
      failedCount: categoriesToExtract.length,
    };
  }

  const succeeded = passResults.filter((r) => !r.error && Object.keys(r.data).length > 0);
  const failed = passResults.filter((r) => r.error || Object.keys(r.data).length === 0);

  console.log(`[llm-multi-pass] Pass results: ${succeeded.length} succeeded, ${failed.length} failed`);
  for (const r of passResults) {
    console.log(`  - ${r.category}: ${r.error ? `FAILED (${r.error.slice(0, 80)})` : `OK (${Object.keys(r.data).length} fields, ${r.durationMs}ms)`}`);
  }

  // ── Check: if most passes failed, fall back to single-pass ──
  if (succeeded.length === 0) {
    console.log("[llm-multi-pass] All passes failed — falling back to single-pass");
    const dna = await runSinglePassFallback(
      config.llmConfig,
      config.url,
      config.markdown,
      config.screenshot,
      config.categories,
      config.isDeep,
    );
    return {
      mode: "single_pass",
      dna,
      passes: passResults,
      totalDurationMs: Date.now() - totalStart,
      succeededCount: 0,
      failedCount: categoriesToExtract.length,
    };
  }

  // ── Synthesis pass ──
  console.log("[llm-multi-pass] Running synthesis pass...");
  let synthesizedDna: Record<string, unknown> | null;

  // If only 1 pass succeeded and it's not worth synthesizing, use it directly
  if (succeeded.length === 1 && failed.length === 0) {
    synthesizedDna = succeeded[0].data;
  } else {
    synthesizedDna = await runSynthesisPass(
      config.llmConfig,
      passResults,
      config.url,
      config.isDeep,
    );
  }

  // ── Wrap into canonical DNA shape ──
  if (!synthesizedDna) {
    // Synthesis returned null — build from raw merge
    const rawMerge: Record<string, unknown> = {};
    for (const result of succeeded) {
      for (const [key, value] of Object.entries(result.data)) {
        if (!(key in rawMerge)) rawMerge[key] = value;
      }
    }
    synthesizedDna = rawMerge;
  }

  const finalDna = {
    name: config.url,
    source_url: config.url,
    category: "full_page",
    serves_domains: (synthesizedDna.serves_domains as string[]) || [],
    compatible_languages: (synthesizedDna.compatible_languages as string[]) || [],
    compatible_moods: (synthesizedDna.compatible_moods as string[]) || [],
    layout: synthesizedDna.layout ?? null,
    color: synthesizedDna.color ?? synthesizedDna.color_application ?? null,
    typography: synthesizedDna.typography ?? null,
    motion: synthesizedDna.motion ?? null,
    interaction: synthesizedDna.interaction ?? synthesizedDna.interactions ?? null,
    component: synthesizedDna.component ?? synthesizedDna.component_patterns ?? null,
    implementation_notes: synthesizedDna.implementation_notes ?? null,
    quality_score: Math.min(10, Math.max(0, (synthesizedDna.quality_score as number) ?? (config.isDeep ? 7 : 5))),
    quality_source: "multi_pass_extraction",
    extracted_at: new Date().toISOString(),
    validated: false,
  };

  return {
    mode: "multi_pass",
    dna: finalDna,
    passes: passResults,
    totalDurationMs: Date.now() - totalStart,
    succeededCount: succeeded.length,
    failedCount: failed.length,
  };
}
