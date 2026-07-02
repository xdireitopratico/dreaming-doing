import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  collectShallowEvidence,
  scrapeViaUserProvider,
  SHALLOW_SCRAPE_PREFS,
  type ShallowScrapeBundle,
} from "./shallow-extraction.ts";
import type { DesignDnaExtractionInput } from "./design-dna-extraction.ts";

vi.mock("../../../supabase/functions/_shared/web-research-providers.ts", () => ({
  scrapeWebPage: vi.fn(),
}));

import { scrapeWebPage } from "../../../supabase/functions/_shared/web-research-providers.ts";

const baseInput: DesignDnaExtractionInput = {
  url: "https://example.com",
  depth: "shallow",
  categories: ["hero", "typography"],
  userId: "user-1",
};

const scrapeBundle: ShallowScrapeBundle = {
  provider: "jina",
  markdown: "# Example\n\nHero section",
  html: "<html><body><h1>Example</h1></body></html>",
  title: "Example",
  screenshotBase64: "",
  trace: ["scrape:markdown:jina"],
  durationMs: 120,
};

describe("SHALLOW_SCRAPE_PREFS — Gate G3", () => {
  it("usa singleProvider sem fallback", () => {
    expect(SHALLOW_SCRAPE_PREFS.singleProvider).toBe(true);
    expect(SHALLOW_SCRAPE_PREFS.fallback).toBe("none");
  });
});

describe("scrapeViaUserProvider", () => {
  beforeEach(() => {
    vi.mocked(scrapeWebPage).mockReset();
  });

  it("chama scrapeWebPage com singleProvider em markdown e html", async () => {
    vi.mocked(scrapeWebPage)
      .mockResolvedValueOnce({ content: "# Title", provider: "jina", title: "Title" })
      .mockResolvedValueOnce({ content: "<html/>", provider: "jina" })
      .mockRejectedValueOnce(new Error("screenshot n/a"));

    const result = await scrapeViaUserProvider("https://example.com", "jina", {});

    expect(result.markdown).toContain("Title");
    expect(result.html).toBe("<html/>");
    expect(scrapeWebPage).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "jina", format: "markdown" }),
      {},
      expect.objectContaining({ singleProvider: true, fallback: "none" }),
    );
  });

  it("falha legível quando scrape não retorna conteúdo", async () => {
    vi.mocked(scrapeWebPage)
      .mockResolvedValueOnce({ content: "", provider: "firecrawl" })
      .mockResolvedValueOnce({ content: "", provider: "firecrawl" })
      .mockRejectedValueOnce(new Error("no shot"));

    await expect(scrapeViaUserProvider("https://empty.com", "firecrawl", {})).rejects.toThrow(
      /API Models/,
    );
  });
});

describe("collectShallowEvidence", () => {
  it("monta evidência com markdown e trace shallow", () => {
    const evidence = collectShallowEvidence(baseInput, scrapeBundle, "Claude Sonnet");
    expect(evidence.enrichedMarkdown).toContain("Hero section");
    expect(evidence.providerTrace.some((t) => t.startsWith("shallow:"))).toBe(true);
    expect(evidence.providerTrace.some((t) => t.includes("llm:Claude Sonnet"))).toBe(true);
    expect(evidence.screenshotUrl).toBe("");
  });

  it("inclui screenshot data URL quando scrape trouxe imagem", () => {
    const withShot = { ...scrapeBundle, screenshotBase64: "abc123" };
    const evidence = collectShallowEvidence(baseInput, withShot);
    expect(evidence.screenshotUrl).toBe("data:image/png;base64,abc123");
    expect(evidence.screenshots).toHaveLength(1);
  });
});