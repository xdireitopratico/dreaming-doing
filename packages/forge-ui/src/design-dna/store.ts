/**
 * DesignDNA Store — catálogo queryable de DesignDNAs.
 *
 * O agente consulta por domínio, linguagem, mood, categoria ou técnica.
 * O store retorna DNAs relevantes que o LLM usa como matéria-prima
 * para síntese de design.
 */

import type { DesignDNA, DesignDNACategory } from "./types";
import { DESIGN_DNA_SEEDS } from "./seeds";

export class DesignDNAStore {
  private dnas: Map<string, DesignDNA> = new Map();

  constructor(seeds: DesignDNA[] = DESIGN_DNA_SEEDS) {
    for (const dna of seeds) {
      this.dnas.set(dna.id, dna);
    }
  }

  add(dna: DesignDNA): void {
    this.dnas.set(dna.id, dna);
  }

  get(id: string): DesignDNA | undefined {
    return this.dnas.get(id);
  }

  all(): DesignDNA[] {
    return Array.from(this.dnas.values());
  }

  query(filters: {
    domain?: string;
    language?: string;
    mood?: string;
    category?: DesignDNACategory;
    minQuality?: number;
    limit?: number;
  }): DesignDNA[] {
    let results = this.all();

    if (filters.domain) {
      const d = filters.domain.toLowerCase();
      results = results.filter((dna) =>
        dna.serves_domains.some((dom) => dom.toLowerCase().includes(d)),
      );
    }

    if (filters.language) {
      const l = filters.language.toLowerCase();
      results = results.filter((dna) =>
        dna.compatible_languages.some((lang) => lang.toLowerCase().includes(l)),
      );
    }

    if (filters.mood) {
      const m = filters.mood.toLowerCase();
      results = results.filter((dna) =>
        dna.compatible_moods.some((mo) => mo.toLowerCase().includes(m)),
      );
    }

    if (filters.category) {
      results = results.filter((dna) => dna.category === filters.category);
    }

    if (filters.minQuality) {
      results = results.filter((dna) => (dna.quality_score ?? 0) >= filters.minQuality!);
    }

    // Sort by quality score descending
    results.sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0));

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  /** Queries para web_research baseadas no domínio — o agente usa para buscar referências reais. */
  researchQueriesForDomain(domain: string): string[] {
    const d = domain.toLowerCase();
    const queries: string[] = [];

    // Query genérica de alta qualidade
    queries.push(`awwwards best ${domain} website design 2024 2025`);

    // Queries específicas por domínio
    if (/\b(bakery|padaria|food|restaurant|cafe|coffee)\b/.test(d)) {
      queries.push("artisanal bakery editorial brutalist website awwwards");
      queries.push("premium food brand storytelling website design");
    } else if (/\b(saas|fintech|tech|software|app)\b/.test(d)) {
      queries.push("best SaaS landing page design 2024 swiss minimal");
      queries.push("fintech dashboard UI design premium");
    } else if (/\b(fashion|beauty|lifestyle|magazine)\b/.test(d)) {
      queries.push("fashion editorial website design vogue style");
      queries.push("luxury brand cinematic hero website design");
    } else if (/\b(agency|studio|portfolio|creative)\b/.test(d)) {
      queries.push("creative agency brutalist website awwwards");
      queries.push("designer portfolio kinetic typography website");
    } else if (/\b(eco|health|wellness|yoga|nature)\b/.test(d)) {
      queries.push("wellness brand organic minimal website design");
      queries.push("eco nature brand website design premium");
    } else {
      queries.push(`${domain} premium website design inspiration`);
    }

    return queries;
  }
}

/** Singleton store — instância única para o agente. */
let _store: DesignDNAStore | null = null;

export function getDesignDNAStore(): DesignDNAStore {
  if (!_store) {
    _store = new DesignDNAStore();
  }
  return _store;
}
