import { describe, it, expect } from "vitest";
import {
  evaluateLibraryPersistEligibility,
  resolveJobTerminalStatus,
  buildLibraryUpsertRow,
  isDnaStructurallyValidated,
  MIN_DNA_QUALITY_SCORE,
} from "./persist-library-entry.ts";
import type { DesignDnaExtractionResult } from "./design-dna-extraction.ts";

const baseDna = {
  name: "Example Site",
  quality_score: 7,
  layout: { grid: "12-col" },
  color: { primary: "#000" },
  typography: { heading: "Inter" },
};

const baseExtraction = {
  rawMarkdown: "md",
  cleanMarkdown: "clean",
  rawHtml: "<html/>",
  cleanHtml: "<main/>",
  contentHygiene: {
    title: "Example",
    rootSelector: "main",
    rawMarkdownChars: 2,
    cleanMarkdownChars: 2,
    rawHtmlChars: 8,
    cleanHtmlChars: 6,
  },
  screenshotUrl: "",
  screenshots: [],
  providerTrace: ["llm:test"],
  confidence: 80,
  notes: [],
  blockedReason: null,
} satisfies Omit<DesignDnaExtractionResult, "dna">;

describe("evaluateLibraryPersistEligibility — Gate G2", () => {
  it("rejeita quando não há DNA", () => {
    const result = evaluateLibraryPersistEligibility(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("no_dna");
  });

  it("rejeita DNA com quality abaixo do mínimo", () => {
    const result = evaluateLibraryPersistEligibility({
      ...baseDna,
      quality_score: MIN_DNA_QUALITY_SCORE - 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("quality_threshold");
  });

  it("rejeita quando validador estrutural rejeita", () => {
    const result = evaluateLibraryPersistEligibility(baseDna, {
      validationRejected: true,
      validationScore: 32,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("validation_rejected");
  });

  it("aceita DNA válido", () => {
    const result = evaluateLibraryPersistEligibility(baseDna);
    expect(result.ok).toBe(true);
  });
});

describe("resolveJobTerminalStatus — Gate G2", () => {
  it("failed quando zero library e zero errors (terminal vazio)", () => {
    const terminal = resolveJobTerminalStatus({
      urlsTotal: 1,
      libraryPersistedCount: 0,
      errors: [],
      blockedCount: 0,
    });
    expect(terminal.status).toBe("failed");
    expect(terminal.ok).toBe(false);
    expect(terminal.jobError).toContain("G2");
  });

  it("failed quando zero library com errors", () => {
    const terminal = resolveJobTerminalStatus({
      urlsTotal: 2,
      libraryPersistedCount: 0,
      errors: [{ url: "https://a.com", error: "quality baixa", kind: "quality_threshold" }],
      blockedCount: 0,
    });
    expect(terminal.status).toBe("failed");
    expect(terminal.jobError).toContain("quality");
  });

  it("completed só com library para todas URLs sem erros", () => {
    const terminal = resolveJobTerminalStatus({
      urlsTotal: 2,
      libraryPersistedCount: 2,
      errors: [],
      blockedCount: 0,
    });
    expect(terminal.status).toBe("completed");
    expect(terminal.ok).toBe(true);
  });

  it("failed quando sucesso parcial (G2 rigoroso — spec §4.2)", () => {
    const terminal = resolveJobTerminalStatus({
      urlsTotal: 2,
      libraryPersistedCount: 1,
      errors: [{ url: "https://b.com", error: "falhou", kind: "no_dna" }],
      blockedCount: 0,
    });
    expect(terminal.status).toBe("failed");
    expect(terminal.ok).toBe(false);
    expect(terminal.jobError).toBeTruthy();
  });

  it("nunca completed com libraryPersistedCount zero", () => {
    const terminal = resolveJobTerminalStatus({
      urlsTotal: 1,
      libraryPersistedCount: 0,
      errors: [{ error: "upsert failed", kind: "library_upsert" }],
      blockedCount: 0,
    });
    expect(terminal.status).not.toBe("completed");
  });
});

describe("isDnaStructurallyValidated", () => {
  it("true quando validationScore >= 40 e não rejeitado", () => {
    expect(
      isDnaStructurallyValidated({
        ...baseExtraction,
        dna: baseDna,
        validationScore: 72,
        validationRejected: false,
      }),
    ).toBe(true);
  });

  it("false quando validationRejected", () => {
    expect(
      isDnaStructurallyValidated({
        ...baseExtraction,
        dna: baseDna,
        validationScore: 72,
        validationRejected: true,
      }),
    ).toBe(false);
  });
});

describe("buildLibraryUpsertRow", () => {
  it("monta row com campos obrigatórios da spec", () => {
    const row = buildLibraryUpsertRow(
      {
        url: "https://example.com",
        urlIndex: 0,
        depth: "shallow",
        ingestKind: "production",
        userId: "user-1",
        categories: ["hero", "motion"],
      },
      baseDna,
      { ...baseExtraction, dna: baseDna },
    );
    expect(row.source_url).toBe("https://example.com");
    expect(row.ingest_kind).toBe("production");
    expect(row.extracted_by).toBe("user-1");
    expect(row.quality_score).toBe(7);
    expect(row.provider_trace).toEqual(["llm:test"]);
    expect(row.design_dna).toBeTruthy();
    expect(row.validated).toBe(false);
  });

  it("validated true quando DNA passou no validador estrutural", () => {
    const row = buildLibraryUpsertRow(
      {
        url: "https://example.com",
        urlIndex: 0,
        depth: "shallow",
        ingestKind: "production",
        userId: "user-1",
        categories: ["hero"],
      },
      baseDna,
      {
        ...baseExtraction,
        dna: baseDna,
        validationScore: 55,
        validationRejected: false,
      },
    );
    expect(row.validated).toBe(true);
  });
});