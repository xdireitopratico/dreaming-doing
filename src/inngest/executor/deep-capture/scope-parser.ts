import type { ExtractionScope, ScopeFolds, ScopeIntent, ScopePages } from "@/lib/agent-deep-capture-contract";

export type ScopeInstructionPatch = {
  level?: number;
  intent?: ScopeIntent;
  pages?: ScopePages;
  folds?: ScopeFolds;
  viewports?: ExtractionScope["viewports"];
  categories?: string[];
  pageUrls?: string[];
  excludeSelectors?: string[];
  maxCaptures?: number | null;
};

function normalizeInstructionText(content: string): string {
  return content
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Parse heurístico de instruções do chat → mutação de escopo (PR-3). */
export function parseScopeFromInstruction(content: string): ScopeInstructionPatch | null {
  const text = normalizeInstructionText(content.trim());
  if (!text) return null;

  const patch: ScopeInstructionPatch = {};
  let matched = false;

  if (
    /100%|mapeia tudo|site inteiro|full site|map everything|todo o site/.test(text)
  ) {
    patch.intent = "full_site";
    patch.pages = "sitemap";
    patch.level = 10;
    patch.folds = "all";
    patch.maxCaptures = null;
    matched = true;
  }

  if (/so hero|somente hero|hero only|apenas hero|only hero/.test(text)) {
    patch.folds = "hero_only";
    patch.categories = ["hero"];
    patch.level = Math.min(patch.level ?? 7, 5);
    matched = true;
  }

  if (/inclui mobile|adiciona mobile|viewport mobile|mobile too/.test(text)) {
    patch.viewports = ["desktop", "tablet", "mobile"];
    matched = true;
  }

  if (/inclui tablet|adiciona tablet|viewport tablet/.test(text)) {
    patch.viewports = ["desktop", "tablet"];
    matched = true;
  }

  const pagePathMatch = text.match(
    /(?:inclui|incluir|add|mapeia|map)\s+(\/[a-z0-9/_-]+)/i,
  );
  if (pagePathMatch) {
    patch.pages = "user_list";
    patch.pageUrls = [pagePathMatch[1]];
    matched = true;
  }

  if (/ignora footer|ignore footer|sem footer|skip footer/.test(text)) {
    patch.excludeSelectors = ["footer"];
    matched = true;
  }

  if (/curated|curadoria|selecionado/.test(text)) {
    patch.intent = "curated";
    matched = true;
  }

  return matched ? patch : null;
}

export function mergeExtractionScope(
  current: ExtractionScope,
  patch: ScopeInstructionPatch,
): ExtractionScope {
  const viewports = patch.viewports ?? current.viewports;
  const pageUrls = [...(current.pageUrls ?? [])];
  if (patch.pageUrls?.length) {
    for (const url of patch.pageUrls) {
      if (!pageUrls.includes(url)) pageUrls.push(url);
    }
  }

  const excludeSelectors = [...(current.excludeSelectors ?? [])];
  if (patch.excludeSelectors?.length) {
    for (const sel of patch.excludeSelectors) {
      if (!excludeSelectors.includes(sel)) excludeSelectors.push(sel);
    }
  }

  return {
    ...current,
    level: patch.level ?? current.level,
    intent: patch.intent ?? current.intent,
    pages: patch.pages ?? current.pages,
    folds: patch.folds ?? current.folds,
    viewports,
    categories: patch.categories ?? current.categories,
    pageUrls: pageUrls.length > 0 ? pageUrls : undefined,
    excludeSelectors: excludeSelectors.length > 0 ? excludeSelectors : undefined,
    capturePolicy: {
      ...current.capturePolicy,
      maxCaptures:
        patch.maxCaptures !== undefined ? patch.maxCaptures : current.capturePolicy.maxCaptures,
    },
  };
}

export function summarizeScopeChanges(before: ExtractionScope, after: ExtractionScope): string[] {
  const changes: string[] = [];
  if (before.level !== after.level) changes.push(`level ${before.level} → ${after.level}`);
  if (before.intent !== after.intent) changes.push(`intent ${before.intent} → ${after.intent}`);
  if (before.pages !== after.pages) changes.push(`pages ${before.pages} → ${after.pages}`);
  if (before.folds !== after.folds) changes.push(`folds ${before.folds} → ${after.folds}`);
  if (JSON.stringify(before.viewports) !== JSON.stringify(after.viewports)) {
    changes.push(`viewports → ${after.viewports.join(", ")}`);
  }
  if (JSON.stringify(before.categories) !== JSON.stringify(after.categories)) {
    changes.push(`categories → ${after.categories.join(", ")}`);
  }
  return changes;
}