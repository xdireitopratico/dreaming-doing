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
 * The LLM call is delegated via an injected callback — this module
 * does NOT duplicate any LLM protocol logic. It uses whatever chat
 * function the caller provides (openai, anthropic, gemini, etc.)
 */

import {
  CATEGORY_PROMPTS,
  MASTER_EXTRACTION_PROMPT,
  type ExtractionCategory,
} from "../../../../supabase/functions/extract-design-dna/prompts.ts";

// ── Types ──

export type LLMConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
  protocol: "openai" | "anthropic" | "gemini";
};

/**
 * Injected LLM caller — must match the signature of the 3-protocol
 * chat functions (openAiChat, anthropicChat, geminiChat) in
 * design-dna-extraction.ts. Timeout is managed by the caller.
 */
export type LLmChatFn = (
  systemPrompt: string,
  userContent: string,
  screenshot: string,
) => Promise<{ content: string }>;

export type MultiPassConfig = {
  llmConfig: LLMConfig;
  /** The actual LLM call function (delegates to openAiChat/anthropicChat/geminiChat) */
  callLlm: LLmChatFn;
  url: string;
  markdown: string;
  screenshot: string;
  categories: string[];
  isDeep: boolean;
  /** Force single-pass (skip multi-pass entirely). Default: false. */
  forceSinglePass?: boolean;
  /** DEEP: navigation report + agent evidence (replaces markdown when set). */
  evidenceText?: string;
  /** DEEP: per-category vision input (signed https URL or data: URL). */
  screenshotByCategory?: Partial<Record<ExtractionCategory, string>>;
  /** DEEP: captureIds referenced in each pass user prompt. */
  captureIdsByCategory?: Partial<Record<ExtractionCategory, string[]>>;
};

type SinglePassResult = {
  category: string;
  data: Record<string, unknown>;
  durationMs: number;
  error?: string;
};

export type MultiPassResult = {
  mode: "multi_pass" | "single_pass";
  dna: Record<string, unknown> | null;
  passes: SinglePassResult[];
  totalDurationMs: number;
  succeededCount: number;
  failedCount: number;
};

// ── Category → LLM field mapping ──

const CATEGORY_FIELD_MAP: Record<string, string[]> = {
  hero: ["layout", "component"],
  motion: ["motion"],
  typography: ["typography"],
  color_application: ["color"],
  components: ["component"],
  interactions: ["interaction"],
};

const PASS_ORDER: ExtractionCategory[] = [
  "hero",
  "typography",
  "color_application",
  "motion",
  "components",
  "interactions",
];

// ── JSON parsing with fallbacks ──

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && Object.keys(parsed).length > 0) {
      return parsed as Record<string, unknown>;
    }
  } catch { /* fall through */ }

  const codeMatch = raw.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
  if (codeMatch) {
    try {
      const parsed = JSON.parse(codeMatch[1]);
      if (typeof parsed === "object" && parsed !== null && Object.keys(parsed).length > 0) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* fall through */ }
  }

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

// ── Category-aware prompt builders ──

function visionLabel(screenshot: string): string {
  if (!screenshot) return "[sem imagem]";
  if (screenshot.startsWith("data:")) return "[thumb anexado]";
  if (screenshot.startsWith("http")) return "[thumb signed URL anexado]";
  return screenshot;
}

function buildCategoryUserContent(
  category: ExtractionCategory,
  url: string,
  markdown: string,
  screenshot: string,
  evidenceText?: string,
  captureIds?: string[],
): string {
  const modeLabel = visionLabel(screenshot);
  const captureLine = captureIds?.length ? `\n### Capture IDs: ${captureIds.join(", ")}` : "";
  const baseIntro = `## Site: ${url}\n### Vision: ${modeLabel}${captureLine}\n\n`;
  const body = evidenceText ?? markdown;
  const slice = (n: number) => body.slice(0, n);
  const sourceLabel = evidenceText ? "Evidências DEEP" : "Markdown";

  switch (category) {
    case "hero":
      return `${baseIntro}### ${sourceLabel}:\n${slice(15000)}\n\nExtraia o DNA de HERO/LAYOUT deste site.`;
    case "motion":
      return `${baseIntro}### ${sourceLabel}:\n${slice(25000)}\n\nExtraia o DNA de MOTION deste site.`;
    case "typography":
      return `${baseIntro}### ${sourceLabel}:\n${slice(20000)}\n\nExtraia o DNA de TIPOGRAFIA deste site.`;
    case "color_application":
      return `${baseIntro}### ${sourceLabel}:\n${slice(20000)}\n\nExtraia o DNA de COR deste site.`;
    case "components":
      return `${baseIntro}### ${sourceLabel}:\n${slice(25000)}\n\nExtraia o DNA de COMPONENTES deste site.`;
    case "interactions":
      return `${baseIntro}### ${sourceLabel}:\n${slice(20000)}\n\nExtraia o DNA de INTERAÇÕES deste site.`;
    default:
      return `${baseIntro}### ${sourceLabel}:\n${slice(20000)}`;
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
  callLlm: LLmChatFn,
  category: ExtractionCategory,
  url: string,
  markdown: string,
  screenshot: string,
  isDeep: boolean,
  evidenceText?: string,
  captureIds?: string[],
): Promise<SinglePassResult> {
  const start = Date.now();
  try {
    const systemPrompt = buildCategorySystemPrompt(category, isDeep);
    const userContent = buildCategoryUserContent(
      category,
      url,
      markdown,
      screenshot,
      evidenceText,
      captureIds,
    );

    const result = await callLlm(systemPrompt, userContent, screenshot);
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

async function runSynthesisPass(
  callLlm: LLmChatFn,
  passResults: SinglePassResult[],
  url: string,
  isDeep: boolean,
): Promise<Record<string, unknown> | null> {
  const successfulResults = passResults.filter((r) => !r.error && Object.keys(r.data).length > 0);
  if (successfulResults.length === 0) return null;

  // Build merged JSON from all passes
  const combinedData: Record<string, unknown> = {};
  for (const result of successfulResults) {
    const targetFields = CATEGORY_FIELD_MAP[result.category] ?? [];
    for (const field of targetFields) {
      if (!(field in combinedData)) {
        combinedData[field] = result.data[field];
      }
      if (field === "component" && Array.isArray(result.data[field])) {
        if (!Array.isArray(combinedData[field])) combinedData[field] = [];
        const existing = combinedData[field] as Array<unknown>;
        const incoming = result.data[field] as Array<unknown>;
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
    for (const [key, value] of Object.entries(result.data)) {
      if (!["layout", "motion", "typography", "color", "component", "interaction"].includes(key)) {
        if (!(key in combinedData) || combinedData[key] === null) combinedData[key] = value;
      }
    }
  }

  // Lightweight synthesis LLM call to add cross-category insights
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
    // Synthesis pass — no screenshot needed (it's text-only merge work)
    const result = await callLlm(synthesisPrompt, `Sintetize o DNA do site: ${url}`, "");
    return parseJsonResponse(result.content);
  } catch (err) {
    console.warn(`[llm-multi-pass] Synthesis LLM failed: ${err instanceof Error ? err.message : String(err)} — using raw merge`);
    return combinedData;
  }
}

// ── Single-pass fallback (legacy behavior) ──

async function runSinglePassFallback(
  callLlm: LLmChatFn,
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
    const result = await callLlm(systemPrompt, userContent, screenshot);
    return parseJsonResponse(result.content);
  } catch (err) {
    console.error(`[llm-multi-pass] Single-pass fallback failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Main entry point ──

export async function multiPassExtractDNA(config: MultiPassConfig): Promise<MultiPassResult> {
  const totalStart = Date.now();

  const categoriesToExtract = config.categories.filter(
    (cat) => PASS_ORDER.includes(cat as ExtractionCategory),
  );

  // Use single-pass when only 1 category or forced
  if (config.forceSinglePass || categoriesToExtract.length <= 1) {
    console.log(`[llm-multi-pass] Using single-pass mode (${categoriesToExtract.length} categories)`);
    const dna = await runSinglePassFallback(
      config.callLlm,
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

  // ── Multi-pass: run all category passes in parallel ──
  console.log(`[llm-multi-pass] Starting ${categoriesToExtract.length} specialized passes in parallel`);

  const evidenceText = config.evidenceText;
  const passPromises = categoriesToExtract.map((cat) => {
    const category = cat as ExtractionCategory;
    const shot =
      config.screenshotByCategory?.[category] ?? config.screenshot;
    return runCategoryPass(
      config.callLlm,
      category,
      config.url,
      config.markdown,
      shot,
      config.isDeep,
      evidenceText,
      config.captureIdsByCategory?.[category],
    );
  });

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

  console.log(`[llm-multi-pass] Pass results: ${succeeded.length} ok, ${failed.length} fail`);
  for (const r of passResults) {
    const info = r.error
      ? `FAIL (${r.error.slice(0, 80)})`
      : `OK (${Object.keys(r.data).length} fields, ${r.durationMs}ms)`;
    console.log(`  - ${r.category}: ${info}`);
  }

  // ── If all passes failed, fall back to single-pass ──
  if (succeeded.length === 0) {
    console.log("[llm-multi-pass] All passes failed — falling back to single-pass");
    const dna = await runSinglePassFallback(
      config.callLlm,
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

  if (succeeded.length === 1 && failed.length === 0) {
    synthesizedDna = succeeded[0].data;
  } else {
    synthesizedDna = await runSynthesisPass(
      config.callLlm,
      passResults,
      config.url,
      config.isDeep,
    );
  }

  if (!synthesizedDna) {
    const rawMerge: Record<string, unknown> = {};
    for (const result of succeeded) {
      for (const [key, value] of Object.entries(result.data)) {
        if (!(key in rawMerge)) rawMerge[key] = value;
      }
    }
    synthesizedDna = rawMerge;
  }

  // ── Wrap into canonical DNA shape ──
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
    quality_source: config.isDeep ? "deep_multi_pass" : "multi_pass_extraction",
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
