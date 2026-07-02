import type { SupabaseClient } from "@supabase/supabase-js";
import type { NavigationReport } from "@/lib/agent-deep-capture-contract";
import type { BrowserAgentStep } from "./browser-agent-state";
import type { SynthesizedDNA } from "./browser-agent-synthesis";
import { sanitizeObservationForEvidence } from "./deep-capture/sanitize";
import {
  createCaptureThumbSignedUrl,
  listJobCaptures,
  type JobCaptureRow,
} from "./deep-capture/capture-storage";
import type { LLMConfig } from "./design-dna-extraction";
import type { LLmChatFn } from "./refero/llm-multi-pass";
import { multiPassExtractDNA } from "./refero/llm-multi-pass";
import type { ExtractionCategory } from "../../../supabase/functions/extract-design-dna/prompts";

export type { JobCaptureRow };

const CATEGORY_SECTION_TYPES: Record<ExtractionCategory, string[]> = {
  hero: ["hero", "cta"],
  typography: ["hero", "features", "unknown"],
  color_application: ["hero", "features", "pricing"],
  motion: ["hero", "features"],
  components: ["features", "pricing", "testimonials", "footer"],
  interactions: ["nav", "cta", "hero"],
};

const MAX_VISION_PER_PASS = 1;

export function pickCaptureIdsForCategory(
  captures: JobCaptureRow[],
  report: NavigationReport,
  category: ExtractionCategory,
  max = MAX_VISION_PER_PASS,
): string[] {
  const allowed = new Set(CATEGORY_SECTION_TYPES[category]);
  const sections = report.pagesVisited.flatMap((p) => p.sections);
  const matched = sections.filter((s) => allowed.has(s.type)).map((s) => s.captureId);
  const unique = [...new Set(matched)].slice(0, max);
  if (unique.length > 0) return unique;
  return captures.slice(0, max).map((c) => c.id);
}

export function buildDeepEvidenceText(
  report: NavigationReport,
  steps: BrowserAgentStep[],
): string {
  const lines: string[] = [
    "## Navigation Report",
    `Captures qualificados: ${report.capturesQualified}`,
    `Páginas visitadas: ${report.pagesVisited.length}`,
  ];

  if (report.highlights.length > 0) {
    lines.push("", "### Highlights", ...report.highlights.map((h) => `- ${h}`));
  }
  if (report.typographyNotes.length > 0) {
    lines.push("", "### Typography notes", ...report.typographyNotes.map((n) => `- ${n}`));
  }
  if (report.colorNotes.length > 0) {
    lines.push("", "### Color notes", ...report.colorNotes.map((n) => `- ${n}`));
  }
  if (report.motionObservations.length > 0) {
    lines.push("", "### Motion", ...report.motionObservations.map((n) => `- ${n}`));
  }
  if (report.componentInventory.length > 0) {
    lines.push("", "### Components", ...report.componentInventory.map((n) => `- ${n}`));
  }

  for (const page of report.pagesVisited) {
    lines.push("", `### Page: ${page.url}`);
    for (const section of page.sections) {
      lines.push(`- [${section.type}] ${section.label} (captureId: ${section.captureId})`);
    }
  }

  if (steps.length > 0) {
    lines.push("", "## Agent steps (sanitized)");
    for (const step of steps.slice(-15)) {
      lines.push(
        `Step ${step.stepNumber}: ${step.thought}`,
        `Action: ${step.action.type}`,
        `Observation: ${JSON.stringify(sanitizeObservationForEvidence(step.observation))}`,
      );
    }
  }

  return lines.join("\n");
}

async function resolveCategoryVision(
  supabase: SupabaseClient,
  captures: JobCaptureRow[],
  captureIds: string[],
): Promise<string> {
  const id = captureIds[0];
  if (!id) return "";
  const row = captures.find((c) => c.id === id);
  if (!row?.thumb_path) return "";
  return createCaptureThumbSignedUrl(supabase, row.thumb_path);
}

function toSynthesizedDNA(dna: Record<string, unknown>, url: string): SynthesizedDNA {
  const now = new Date().toISOString();
  return {
    name: String(dna.name ?? url),
    source_url: url,
    category: String(dna.category ?? "full_page"),
    layout: (dna.layout as Record<string, unknown>) ?? null,
    color: (dna.color as Record<string, unknown>) ?? null,
    typography: (dna.typography as Record<string, unknown>) ?? null,
    motion: (dna.motion as Record<string, unknown>) ?? null,
    interaction: (dna.interaction as Record<string, unknown>) ?? null,
    component: (dna.component as Record<string, unknown>) ?? null,
    implementation_notes: String(dna.implementation_notes ?? "") || null,
    quality_score: Math.min(10, Math.max(0, Number(dna.quality_score ?? 7))),
    quality_source: String(dna.quality_source ?? "deep_multi_pass"),
    serves_domains: Array.isArray(dna.serves_domains) ? (dna.serves_domains as string[]) : [],
    compatible_languages: Array.isArray(dna.compatible_languages)
      ? (dna.compatible_languages as string[])
      : [],
    compatible_moods: Array.isArray(dna.compatible_moods) ? (dna.compatible_moods as string[]) : [],
    extracted_at: String(dna.extracted_at ?? now),
  };
}

export type RunDeepExtractionInput = {
  supabase: SupabaseClient;
  jobId: string;
  url: string;
  categories: string[];
  steps: BrowserAgentStep[];
  navigationReport: NavigationReport;
  callLlm: LLmChatFn;
  llmConfig: LLMConfig;
};

export async function runDeepExtraction(input: RunDeepExtractionInput): Promise<SynthesizedDNA> {
  const captures = await listJobCaptures(input.supabase, input.jobId);
  const evidenceText = buildDeepEvidenceText(input.navigationReport, input.steps);

  const screenshotByCategory: Partial<Record<ExtractionCategory, string>> = {};
  const captureIdsByCategory: Partial<Record<ExtractionCategory, string[]>> = {};

  const categories = input.categories.filter((c) =>
    ["hero", "typography", "color_application", "motion", "components", "interactions"].includes(c),
  ) as ExtractionCategory[];

  for (const category of categories) {
    const ids = pickCaptureIdsForCategory(captures, input.navigationReport, category);
    captureIdsByCategory[category] = ids;
    screenshotByCategory[category] = await resolveCategoryVision(input.supabase, captures, ids);
  }

  const fallbackShot = screenshotByCategory.hero ?? Object.values(screenshotByCategory).find(Boolean) ?? "";

  const mpResult = await multiPassExtractDNA({
    llmConfig: input.llmConfig,
    callLlm: input.callLlm,
    url: input.url,
    markdown: "",
    screenshot: fallbackShot,
    categories: input.categories,
    isDeep: true,
    evidenceText,
    screenshotByCategory,
    captureIdsByCategory,
  });

  if (!mpResult.dna) {
    const passErrors = mpResult.passes
      .filter((p) => p.error)
      .map((p) => `${p.category}: ${p.error}`)
      .join("; ");
    throw new Error(
      `DEEP multi-pass synthesis failed — no DNA. Mode: ${mpResult.mode}. ${passErrors}`,
    );
  }

  return toSynthesizedDNA(mpResult.dna, input.url);
}