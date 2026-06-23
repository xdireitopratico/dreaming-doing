import type { LibraryEntry } from "./types";

export interface LibrarySourceCluster {
  sourceUrl: string;
  primary: LibraryEntry;
  entries: LibraryEntry[];
  count: number;
  ingestKinds: string[];
  hasSmoke: boolean;
  hasDuplicates: boolean;
}

export function groupEntriesBySourceUrl(entries: LibraryEntry[]): LibrarySourceCluster[] {
  const grouped = new Map<string, LibraryEntry[]>();

  for (const entry of entries) {
    const key = entry.source_url.trim() || entry.id;
    const bucket = grouped.get(key) ?? [];
    bucket.push(entry);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries())
    .map(([sourceUrl, items]) => {
      const sorted = [...items].sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return bTime - aTime;
      });
      const ingestKinds = Array.from(new Set(sorted.map((item) => item.ingest_kind)));
      return {
        sourceUrl,
        primary: sorted[0]!,
        entries: sorted,
        count: sorted.length,
        ingestKinds,
        hasSmoke: ingestKinds.includes("smoke"),
        hasDuplicates: sorted.length > 1,
      } satisfies LibrarySourceCluster;
    })
    .sort((a, b) => {
      const aTime = new Date(a.primary.created_at).getTime();
      const bTime = new Date(b.primary.created_at).getTime();
      return bTime - aTime;
    });
}
