import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  finalizeDocumentMarkdown,
  sanitizeDocumentMarkdown,
  structurePlainTextAsMarkdown,
  tsvToMarkdownTable,
  truncateDocumentMarkdown,
} from "./document-sanitize.ts";

Deno.test("sanitizeDocumentMarkdown removes page footers and fixes hyphen breaks", () => {
  const raw = "Intro\nPágina 3 de 42\npalavra-\ncontinuação\n\n\n\nFim";
  const out = sanitizeDocumentMarkdown(raw);
  assertEquals(out.includes("Página 3"), false);
  assertEquals(out.includes("palavra-\n"), false);
  assertEquals(out.includes("palavracontinuação") || out.includes("palavra continuação"), true);
});

Deno.test("structurePlainTextAsMarkdown promotes short isolated lines", () => {
  const raw =
    "INTRODUÇÃO\n\nParágrafo longo com texto normal que não é título.\n\n1. Primeiro item";
  const out = structurePlainTextAsMarkdown(raw);
  assertEquals(out.startsWith("## INTRODUÇÃO"), true);
});

Deno.test("tsvToMarkdownTable builds pipe table", () => {
  const out = tsvToMarkdownTable("A\tB\n1\t2");
  assertEquals(out.includes("| A | B |"), true);
  assertEquals(out.includes("| --- |"), true);
});

Deno.test("truncateDocumentMarkdown adds notice when over limit", () => {
  const long = "x".repeat(100);
  const { text, meta } = truncateDocumentMarkdown(long, 50);
  assertEquals(meta.truncated, true);
  assertEquals(text.includes("truncado"), true);
});

Deno.test("finalizeDocumentMarkdown runs full pipeline", () => {
  const { markdown, meta } = finalizeDocumentMarkdown("  hello  \n\n\n  world  ");
  assertEquals(markdown.includes("hello"), true);
  assertEquals(meta.truncated, false);
});
