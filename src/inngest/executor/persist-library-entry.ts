import type { SupabaseClient } from "@supabase/supabase-js";
import { appendJobEvent } from "../functions/_shared-design-dna";
import type { DesignDnaExtractionResult } from "./design-dna-extraction.ts";

export const MIN_DNA_QUALITY_SCORE = 4;
export const REQUIRED_DNA_FIELDS = ["layout", "color", "typography"] as const;

export type LibraryPersistContext = {
  url: string;
  urlIndex: number;
  depth: "shallow" | "deep";
  ingestKind: string;
  userId: string;
  categories: string[];
};

export type LibraryPersistRejectionCode =
  | "no_dna"
  | "blocked"
  | "quality_threshold"
  | "missing_fields"
  | "validation_rejected"
  | "library_upsert";

export type LibraryPersistRejection = {
  ok: false;
  code: LibraryPersistRejectionCode;
  message: string;
  eventType: string;
  details?: Record<string, unknown>;
};

export type LibraryPersistSuccess = {
  ok: true;
  dna: Record<string, unknown>;
  libraryId?: string;
};

export type LibraryPersistResult = LibraryPersistSuccess | LibraryPersistRejection;

export type JobTerminalResolution = {
  status: "completed" | "failed" | "partial" | "blocked";
  ok: boolean;
  jobError?: string;
};

function firstErrorMessage(errors: Array<Record<string, unknown>>): string | undefined {
  for (const row of errors) {
    if (typeof row.error === "string" && row.error.trim()) return row.error.trim();
  }
  return undefined;
}

/** Avaliação pura — usada em testes e antes do upsert. */
export function evaluateLibraryPersistEligibility(
  dna: Record<string, unknown> | null | undefined,
  options: {
    blockedReason?: string | null;
    validationRejected?: boolean;
    validationScore?: number;
  } = {},
): LibraryPersistResult | { ok: true; dna: Record<string, unknown> } {
  if (options.blockedReason?.trim()) {
    return {
      ok: false,
      code: "blocked",
      message: options.blockedReason.trim(),
      eventType: "url_blocked",
      details: { blockedReason: options.blockedReason.trim() },
    };
  }

  if (!dna || typeof dna !== "object") {
    return {
      ok: false,
      code: "no_dna",
      message: "Extração não produziu DNA — nenhum conteúdo para persistir na library.",
      eventType: "validation_error",
      details: { reason: "no_dna" },
    };
  }

  if (options.validationRejected) {
    const score = options.validationScore;
    const scoreLabel = typeof score === "number" ? `${score}/100` : "abaixo do limiar";
    return {
      ok: false,
      code: "validation_rejected",
      message: `DNA rejeitado pelo validador estrutural (score ${scoreLabel}).`,
      eventType: "validation_rejected",
      details: { validationScore: score },
    };
  }

  const qualityScore = Number(dna.quality_score ?? 0);
  if (qualityScore < MIN_DNA_QUALITY_SCORE) {
    return {
      ok: false,
      code: "quality_threshold",
      message: `DNA quality score ${qualityScore}/10 abaixo do mínimo (${MIN_DNA_QUALITY_SCORE}/10).`,
      eventType: "quality_error",
      details: { qualityScore, threshold: MIN_DNA_QUALITY_SCORE },
    };
  }

  const missingFields = REQUIRED_DNA_FIELDS.filter((field) => !dna[field]);
  if (missingFields.length > 0) {
    return {
      ok: false,
      code: "missing_fields",
      message: `DNA sem campos obrigatórios: ${missingFields.join(", ")}.`,
      eventType: "validation_error",
      details: { missingFields },
    };
  }

  return { ok: true, dna };
}

const VALIDATION_PASS_SCORE = 40;

export function isDnaStructurallyValidated(dnaResult: DesignDnaExtractionResult): boolean {
  if (dnaResult.validationRejected) return false;
  if (typeof dnaResult.validationScore !== "number") return false;
  return dnaResult.validationScore >= VALIDATION_PASS_SCORE;
}

export function buildLibraryUpsertRow(
  ctx: LibraryPersistContext,
  dna: Record<string, unknown>,
  dnaResult: DesignDnaExtractionResult,
): Record<string, unknown> {
  const validated = isDnaStructurallyValidated(dnaResult);
  return {
    name: (dna.name as string) || ctx.url,
    source_url: ctx.url,
    ingest_kind: ctx.ingestKind,
    category: (dna.category as string) || "full_page",
    extracted_by: ctx.userId,
    quality_score: Math.max(
      0,
      Math.min(10, Number(dna.quality_score ?? (ctx.depth === "deep" ? 7 : 5))),
    ),
    quality_source:
      (dna.quality_source as string) ||
      (ctx.depth === "deep" ? "deep_extraction" : "shallow_extraction"),
    validated,
    raw_markdown: dnaResult.rawMarkdown,
    clean_markdown: dnaResult.cleanMarkdown,
    raw_html: dnaResult.rawHtml,
    clean_html: dnaResult.cleanHtml,
    content_hygiene: dnaResult.contentHygiene,
    screenshot_url: dnaResult.screenshotUrl,
    screenshot_base64: dnaResult.screenshotBase64 ?? null,
    provider_trace: dnaResult.providerTrace,
    confidence: dnaResult.confidence,
    blocked_reason: dnaResult.blockedReason,
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
    tags: [ctx.categories.join(",")],
    notes: dnaResult.notes.join(" | ") || null,
  };
}

/**
 * Único escritor canônico para design_system_library (Gate G2).
 * Persiste OU retorna rejeição auditável com evento de job.
 */
export async function persistLibraryEntry(
  supabase: SupabaseClient,
  jobId: string,
  ctx: LibraryPersistContext,
  dnaResult: DesignDnaExtractionResult,
): Promise<LibraryPersistResult> {
  const eligibility = evaluateLibraryPersistEligibility(dnaResult.dna, {
    blockedReason: dnaResult.blockedReason,
    validationRejected: dnaResult.validationRejected,
    validationScore: dnaResult.validationScore,
  });

  if (!eligibility.ok) {
    const rejection = eligibility as LibraryPersistRejection;
    const errorRecord = {
      url: ctx.url,
      index: ctx.urlIndex,
      error: rejection.message,
      kind: rejection.code,
      ...(rejection.details ?? {}),
    };
    await appendJobEvent(supabase, jobId, rejection.eventType, {
      url: ctx.url,
      index: ctx.urlIndex,
      ...rejection.details,
      reason: rejection.message,
      code: rejection.code,
    });
    return rejection;
  }

  const dna = eligibility.dna;
  const row = buildLibraryUpsertRow(ctx, dna, dnaResult);

  const { data, error: insertError } = await supabase
    .from("design_system_library")
    .upsert(row, { onConflict: "source_url,ingest_kind" })
    .select("id")
    .single();

  if (insertError) {
    const rejection: LibraryPersistRejection = {
      ok: false,
      code: "library_upsert",
      message: insertError.message,
      eventType: "library_upsert_error",
      details: { dbError: insertError.message },
    };
    await appendJobEvent(supabase, jobId, "library_upsert_error", {
      url: ctx.url,
      index: ctx.urlIndex,
      error: insertError.message,
    });
    return rejection;
  }

  await appendJobEvent(supabase, jobId, "library_persisted", {
    url: ctx.url,
    index: ctx.urlIndex,
    libraryId: (data as { id?: string } | null)?.id ?? null,
    qualityScore: row.quality_score,
  });

  return {
    ok: true,
    dna,
    libraryId: (data as { id?: string } | null)?.id,
  };
}

/** Gate G2: job terminal nunca vazio — completed exige library; failed exige errors[]. */
export function resolveJobTerminalStatus(input: {
  urlsTotal: number;
  libraryPersistedCount: number;
  errors: Array<Record<string, unknown>>;
  blockedCount: number;
}): JobTerminalResolution {
  const { urlsTotal, libraryPersistedCount, errors, blockedCount } = input;
  const errorsCount = errors.length;
  const firstError = firstErrorMessage(errors);

  if (libraryPersistedCount === 0) {
    if (blockedCount > 0 && blockedCount >= urlsTotal) {
      return {
        status: "blocked",
        ok: false,
        jobError: firstError ?? "Todos os sites retornaram blocked",
      };
    }

    if (errorsCount === 0) {
      return {
        status: "failed",
        ok: false,
        jobError:
          "Extração terminou sem entradas na library e sem erros registrados — falha de auditoria (G2).",
      };
    }

    return {
      status: "failed",
      ok: false,
      jobError: firstError ?? "Nenhuma URL foi persistida na Design Library.",
    };
  }

  if (errorsCount === 0 && blockedCount === 0 && libraryPersistedCount >= urlsTotal) {
    return { status: "completed", ok: true };
  }

  // G2 rigoroso: spec §4.2 — completed ou failed; sucesso parcial = failed auditável
  const partialMsg =
    firstError ??
    `Apenas ${libraryPersistedCount}/${urlsTotal} URL(s) persistidas na Design Library.`;
  return {
    status: "failed",
    ok: false,
    jobError: partialMsg,
  };
}