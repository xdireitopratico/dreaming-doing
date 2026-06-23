import { describe, expect, it } from "vitest";

import type { LibraryEntry } from "./types";
import { groupEntriesBySourceUrl } from "./grouping";

function makeEntry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? "Entry",
    source_url: overrides.source_url ?? "https://example.com",
    ingest_kind: overrides.ingest_kind ?? "production",
    category: overrides.category ?? "full_page",
    quality_score: overrides.quality_score ?? 7,
    quality_source: overrides.quality_source ?? "heuristic",
    validated: overrides.validated ?? false,
    raw_markdown: null,
    clean_markdown: null,
    raw_html: null,
    clean_html: null,
    content_hygiene: null,
    screenshot_url: null,
    screenshot_base64: null,
    provider_trace: null,
    confidence: null,
    blocked_reason: null,
    design_dna: null,
    serves_domains: [],
    compatible_languages: [],
    compatible_moods: [],
    tags: [],
    notes: null,
    is_archived: false,
    view_count: 0,
    extracted_at: "2026-06-23T00:00:00.000Z",
    created_at: "2026-06-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupEntriesBySourceUrl", () => {
  it("groups multiple versions of the same source url", () => {
    const clusters = groupEntriesBySourceUrl([
      makeEntry({ id: "1", ingest_kind: "production", source_url: "https://a.dev" }),
      makeEntry({ id: "2", ingest_kind: "smoke", source_url: "https://a.dev" }),
      makeEntry({ id: "3", ingest_kind: "curated", source_url: "https://b.dev" }),
    ]);

    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.sourceUrl).toBe("https://a.dev");
    expect(clusters[0]?.count).toBe(2);
    expect(clusters[0]?.ingestKinds).toEqual(expect.arrayContaining(["production", "smoke"]));
    expect(clusters[0]?.hasDuplicates).toBe(true);
    expect(clusters[1]?.sourceUrl).toBe("https://b.dev");
    expect(clusters[1]?.count).toBe(1);
  });
});
