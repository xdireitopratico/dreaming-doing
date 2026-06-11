import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Espelha parseE2bTokenField de user-e2b.ts (teste sem Supabase).
function parseE2bTokenField(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        const first = parsed.find((x) => typeof x === "string" && x.trim().length > 8);
        if (typeof first === "string") return first.trim();
      }
    } catch {
      /* */
    }
  }
  return trimmed.length > 8 ? trimmed : null;
}

Deno.test("parseE2bTokenField accepts plain e2b key", () => {
  assertEquals(parseE2bTokenField("e2b_abc123456789"), "e2b_abc123456789");
});

Deno.test("parseE2bTokenField accepts JSON pool array", () => {
  assertEquals(parseE2bTokenField('["e2b_pool_key_12345"]'), "e2b_pool_key_12345");
});

Deno.test("parseE2bTokenField rejects short values", () => {
  assertEquals(parseE2bTokenField("e2b_x"), null);
  assertEquals(parseE2bTokenField(""), null);
});
