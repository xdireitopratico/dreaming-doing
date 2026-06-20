import { describe, expect, it } from "vitest";
import { DesignDNAStore, getDesignDNAStore } from "./store";
import { DESIGN_DNA_SEEDS } from "./seeds";

describe("DesignDNAStore", () => {
  it("carrega todas as seeds", () => {
    const store = new DesignDNAStore();
    expect(store.all().length).toBe(DESIGN_DNA_SEEDS.length);
  });

  it("query por domínio retorna matches", () => {
    const store = new DesignDNAStore();
    const results = store.query({ domain: "saas" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((d) =>
      d.serves_domains.some((dom) => dom.toLowerCase().includes("saas")),
    )).toBe(true);
  });

  it("query por mood retorna matches", () => {
    const store = new DesignDNAStore();
    const results = store.query({ mood: "mono" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((d) =>
      d.compatible_moods.some((m) => m.toLowerCase().includes("mono")),
    )).toBe(true);
  });

  it("query por linguagem retorna matches", () => {
    const store = new DesignDNAStore();
    const results = store.query({ language: "swiss" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((d) =>
      d.compatible_languages.some((l) => l.toLowerCase().includes("swiss")),
    )).toBe(true);
  });

  it("query por categoria retorna matches", () => {
    const store = new DesignDNAStore();
    const heroSeeds = DESIGN_DNA_SEEDS.filter((s) => s.category === "hero");
    const results = store.query({ category: "hero" });
    expect(results.length).toBe(heroSeeds.length);
  });

  it("query com minQuality filtra corretamente", () => {
    const store = new DesignDNAStore();
    const results = store.query({ minQuality: 8 });
    expect(results.every((d) => (d.quality_score ?? 0) >= 8)).toBe(true);
  });

  it("query com limit funciona", () => {
    const store = new DesignDNAStore();
    const results = store.query({ limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("query ordena por quality_score descending", () => {
    const store = new DesignDNAStore();
    const results = store.query({});
    for (let i = 1; i < results.length; i++) {
      expect((results[i - 1].quality_score ?? 0)).toBeGreaterThanOrEqual(
        results[i].quality_score ?? 0,
      );
    }
  });

  it("add insere novo DNA", () => {
    const store = new DesignDNAStore([]);
    const dna = createMockDna("test-1", "Test Site");
    store.add(dna);
    expect(store.get("test-1")).toBe(dna);
  });

  it("singleton store é compartilhado", () => {
    const s1 = getDesignDNAStore();
    const s2 = getDesignDNAStore();
    expect(s1).toBe(s2);
  });

  it("researchQueriesForDomain retorna queries", () => {
    const store = new DesignDNAStore([]);
    const queries = store.researchQueriesForDomain("bakery");
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q) => q.includes("bakery"))).toBe(true);
  });

  it("researchQueriesForDomain distingue domínios", () => {
    const store = new DesignDNAStore([]);
    const saasQ = store.researchQueriesForDomain("saas fintech");
    const fashionQ = store.researchQueriesForDomain("fashion brand");
    expect(saasQ.some((q) => q.includes("SaaS"))).toBe(true);
    expect(fashionQ.some((q) => q.includes("fashion"))).toBe(true);
  });
});

function createMockDna(id: string, name: string) {
  return {
    id,
    name,
    source_url: "https://example.com",
    category: "full_page" as const,
    serves_domains: ["test"],
    compatible_languages: ["swiss"],
    compatible_moods: ["mono"],
    layout: { type: "asymmetric split", grid_system: "12 col" },
    quality_score: 7,
    extracted_at: new Date().toISOString(),
    validated: false,
  };
}
