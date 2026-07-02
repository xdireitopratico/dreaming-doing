import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CaptureStats,
  ExtractionScope,
  NavigationReport,
  NavigationReportPage,
} from "@/lib/agent-deep-capture-contract";
import { appendJobEvent } from "../../functions/_shared-design-dna";

export type { NavigationReport, CaptureStats };

export type QualifiedCaptureRecord = {
  pageUrl: string;
  captureId: string;
  label: string;
  sectionType: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function touch(report: NavigationReport): NavigationReport {
  return { ...report, updatedAt: nowIso() };
}

function findOrCreatePage(
  pages: NavigationReportPage[],
  url: string,
  title?: string,
): NavigationReportPage[] {
  const idx = pages.findIndex((p) => p.url === url);
  if (idx >= 0) {
    const next = [...pages];
    if (title && !next[idx].title) {
      next[idx] = { ...next[idx], title };
    }
    return next;
  }
  return [
    ...pages,
    {
      url,
      title: title ?? "",
      foldsCaptured: 0,
      sections: [],
    },
  ];
}

function updatePage(
  pages: NavigationReportPage[],
  url: string,
  updater: (page: NavigationReportPage) => NavigationReportPage,
): NavigationReportPage[] {
  const idx = pages.findIndex((p) => p.url === url);
  if (idx < 0) return pages;
  const next = [...pages];
  next[idx] = updater(next[idx]);
  return next;
}

export function createNavigationReport(jobId: string, scope: ExtractionScope): NavigationReport {
  return {
    jobId,
    version: 0,
    scope,
    pagesVisited: [],
    capturesQualified: 0,
    capturesRejected: 0,
    highlights: [],
    motionObservations: [],
    typographyNotes: [],
    colorNotes: [],
    componentInventory: [],
    gaps: [],
    userInstructionsApplied: [],
    updatedAt: nowIso(),
  };
}

export function parseNavigationReport(
  raw: unknown,
  jobId: string,
  scope: ExtractionScope,
): NavigationReport {
  const base = createNavigationReport(jobId, scope);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;

  const pagesVisited = Array.isArray(r.pagesVisited)
    ? (r.pagesVisited as NavigationReportPage[])
    : base.pagesVisited;

  return {
    ...base,
    version: typeof r.version === "number" ? r.version : base.version,
    pagesVisited,
    capturesQualified:
      typeof r.capturesQualified === "number" ? r.capturesQualified : base.capturesQualified,
    capturesRejected:
      typeof r.capturesRejected === "number" ? r.capturesRejected : base.capturesRejected,
    highlights: Array.isArray(r.highlights)
      ? r.highlights.filter((h): h is string => typeof h === "string")
      : base.highlights,
    motionObservations: Array.isArray(r.motionObservations)
      ? r.motionObservations.filter((h): h is string => typeof h === "string")
      : base.motionObservations,
    typographyNotes: Array.isArray(r.typographyNotes)
      ? r.typographyNotes.filter((h): h is string => typeof h === "string")
      : base.typographyNotes,
    colorNotes: Array.isArray(r.colorNotes)
      ? r.colorNotes.filter((h): h is string => typeof h === "string")
      : base.colorNotes,
    componentInventory: Array.isArray(r.componentInventory)
      ? r.componentInventory.filter((h): h is string => typeof h === "string")
      : base.componentInventory,
    gaps: Array.isArray(r.gaps)
      ? r.gaps.filter((h): h is string => typeof h === "string")
      : base.gaps,
    userInstructionsApplied: Array.isArray(r.userInstructionsApplied)
      ? r.userInstructionsApplied.filter((h): h is string => typeof h === "string")
      : base.userInstructionsApplied,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : base.updatedAt,
  };
}

export function captureStatsFromReport(report: NavigationReport): CaptureStats {
  return {
    qualified: report.capturesQualified,
    rejected: report.capturesRejected,
    pages: report.pagesVisited.length,
  };
}

export function recordPageVisit(
  report: NavigationReport,
  url: string,
  title?: string,
): NavigationReport {
  return touch({
    ...report,
    pagesVisited: findOrCreatePage(report.pagesVisited, url, title),
  });
}

export function recordQualifiedCapture(
  report: NavigationReport,
  input: QualifiedCaptureRecord,
): NavigationReport {
  let pages = findOrCreatePage(report.pagesVisited, input.pageUrl);
  pages = updatePage(pages, input.pageUrl, (page) => ({
    ...page,
    foldsCaptured: page.foldsCaptured + 1,
    sections: [
      ...page.sections,
      { type: input.sectionType, label: input.label, captureId: input.captureId },
    ],
  }));

  const highlights = report.highlights.includes(input.label)
    ? report.highlights
    : [...report.highlights, input.label].slice(-20);

  return touch({
    ...report,
    pagesVisited: pages,
    capturesQualified: report.capturesQualified + 1,
    highlights,
  });
}

export function recordRejectedCapture(report: NavigationReport): NavigationReport {
  return touch({
    ...report,
    capturesRejected: report.capturesRejected + 1,
  });
}

export function recordHighlight(report: NavigationReport, note: string): NavigationReport {
  const trimmed = note.trim();
  if (!trimmed || report.highlights.includes(trimmed)) return report;
  return touch({
    ...report,
    highlights: [...report.highlights, trimmed].slice(-20),
  });
}

export function recordUserInstruction(report: NavigationReport, content: string): NavigationReport {
  const trimmed = content.trim().slice(0, 500);
  if (!trimmed) return report;
  return touch({
    ...report,
    userInstructionsApplied: [...report.userInstructionsApplied, trimmed].slice(-10),
  });
}

export function shouldEmitPartialReport(
  report: NavigationReport,
  scope: ExtractionScope,
): boolean {
  const n = scope.reportPolicy.partialEveryNCaptures;
  if (n <= 0) return false;
  return report.capturesQualified > 0 && report.capturesQualified % n === 0;
}

export function bumpPartialVersion(report: NavigationReport): NavigationReport {
  return touch({ ...report, version: report.version + 1 });
}

export function buildPartialPayload(report: NavigationReport): {
  version: number;
  highlights: string[];
  capturesQualified: number;
  pagesVisited: number;
} {
  return {
    version: report.version,
    highlights: report.highlights.slice(-5),
    capturesQualified: report.capturesQualified,
    pagesVisited: report.pagesVisited.length,
  };
}

export function summarizeNavigationReport(report: NavigationReport): NavigationReport {
  return {
    ...report,
    highlights: report.highlights.slice(-10),
    motionObservations: report.motionObservations.slice(-10),
    typographyNotes: report.typographyNotes.slice(-10),
    colorNotes: report.colorNotes.slice(-10),
    componentInventory: report.componentInventory.slice(-15),
    gaps: report.gaps.slice(-10),
    userInstructionsApplied: report.userInstructionsApplied.slice(-5),
  };
}

export function formatNavigationReportSummary(report: NavigationReport): string {
  const pages = report.pagesVisited.map((p) => p.url).join(", ") || "nenhuma";
  const highlights = report.highlights.slice(0, 5).join("; ") || "—";
  return [
    `Captures qualificados: ${report.capturesQualified}`,
    `Rejeitados: ${report.capturesRejected}`,
    `Páginas: ${report.pagesVisited.length} (${pages})`,
    `Destaques: ${highlights}`,
  ].join("\n");
}

export async function persistNavigationMeta(
  supabase: SupabaseClient,
  jobId: string,
  report: NavigationReport,
  currentMeta: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const nextMeta = {
    ...currentMeta,
    navigationReport: report,
    captureStats: captureStatsFromReport(report),
  };
  await supabase.from("design_dna_jobs").update({ meta: nextMeta }).eq("id", jobId);
  return nextMeta;
}

export async function emitReportPartial(
  supabase: SupabaseClient,
  jobId: string,
  report: NavigationReport,
): Promise<NavigationReport> {
  const bumped = bumpPartialVersion(report);
  await appendJobEvent(supabase, jobId, "report_partial", buildPartialPayload(bumped));
  return bumped;
}

export async function emitReportFinal(
  supabase: SupabaseClient,
  jobId: string,
  report: NavigationReport,
): Promise<void> {
  if (!report.scope.reportPolicy.finalReport) return;
  await appendJobEvent(supabase, jobId, "report_final", {
    report: summarizeNavigationReport(report),
  });
}

export class NavigationReportTracker {
  private report: NavigationReport;
  private metaRef: Record<string, unknown>;

  constructor(
    private supabase: SupabaseClient,
    private jobId: string,
    scope: ExtractionScope,
    initial?: NavigationReport,
    metaRef: Record<string, unknown> = {},
  ) {
    this.report = initial ?? createNavigationReport(jobId, scope);
    this.metaRef = metaRef;
  }

  get snapshot(): NavigationReport {
    return this.report;
  }

  get stats(): CaptureStats {
    return captureStatsFromReport(this.report);
  }

  async recordPageVisit(url: string, title?: string): Promise<void> {
    this.report = recordPageVisit(this.report, url, title);
    await this.flush();
  }

  async recordQualified(input: QualifiedCaptureRecord): Promise<void> {
    this.report = recordQualifiedCapture(this.report, input);
    await this.flush();
    if (shouldEmitPartialReport(this.report, this.report.scope)) {
      this.report = await emitReportPartial(this.supabase, this.jobId, this.report);
      await this.flush();
    }
  }

  async recordRejected(): Promise<void> {
    this.report = recordRejectedCapture(this.report);
    await this.flush();
  }

  async recordInstruction(content: string): Promise<void> {
    this.report = recordUserInstruction(this.report, content);
    await this.flush();
  }

  async finalize(): Promise<NavigationReport> {
    await emitReportFinal(this.supabase, this.jobId, this.report);
    await this.flush();
    return this.report;
  }

  summaryText(): string {
    return formatNavigationReportSummary(this.report);
  }

  private async flush(): Promise<void> {
    this.metaRef = await persistNavigationMeta(
      this.supabase,
      this.jobId,
      this.report,
      this.metaRef,
    );
  }
}