import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dnaIdsFromReferences, resolveDesignPackage } from "./design-resolve.ts";

Deno.test("resolveDesignPackage — fintech ≠ padaria em compositions", () => {
  const fintech = resolveDesignPackage({ domain: "fintech saas dashboard" });
  const padaria = resolveDesignPackage({ domain: "padaria artesanal premium" });
  assert(fintech.compositions.join(",") !== padaria.compositions.join(","));
});

Deno.test("resolveDesignPackage — summary compacto e critic pass", () => {
  const pkg = resolveDesignPackage({ domain: "estúdio de podcast criativo" });
  assertEquals(pkg.critic.pass, true);
  assert(pkg.summary.length <= 2500);
  assert(pkg.read_paths.length >= 2);
  assert(pkg.techniques.length >= 1);
});

Deno.test("dnaIdsFromReferences — extrai IDs válidos do manifest (H40)", () => {
  const ids = dnaIdsFromReferences([
    { url: "https://a.com", extracted_dna: "linear-motion-choreography" },
    { url: "https://b.com", extracted_dna: "invalid-id" },
  ]);
  assertEquals(ids, ["linear-motion-choreography"]);
});

Deno.test("resolveDesignPackage — merge extractedDnaIds prioritário", () => {
  const pkg = resolveDesignPackage({
    domain: "fintech",
    extractedDnaIds: ["stripe-editorial-density", "linear-motion-choreography"],
  });
  assertEquals(pkg.relevant_dnas[0], "stripe-editorial-density");
});

const S1_DOMAINS = [
  { id: "fintech", domain: "fintech saas dashboard pagamentos" },
  { id: "padaria", domain: "padaria artesanal premium sourdough" },
  { id: "gaming", domain: "gaming cyber arena esports neon" },
  { id: "yoga", domain: "yoga wellness retreat mindfulness" },
  { id: "fashion", domain: "fashion boutique luxury editorial" },
] as const;

Deno.test("resolveDesignPackage — S1 cinco domínios geram variação de hero", () => {
  const heroes = new Set(
    S1_DOMAINS.map((d) => resolveDesignPackage({ domain: d.domain }).compositions[0]),
  );
  assert(heroes.size >= 3, `esperado ≥3 heroes distintos, obteve ${heroes.size}`);
});

Deno.test("resolveDesignPackage — S1 cinco domínios geram variação de mood", () => {
  const moods = new Set(
    S1_DOMAINS.map((d) => resolveDesignPackage({ domain: d.domain }).proposal.mood),
  );
  assert(moods.size >= 2, `esperado ≥2 moods distintos, obteve ${moods.size}`);
});

Deno.test("resolveDesignPackage — S1 cinco domínios geram variação de techniques", () => {
  const techniqueSets = new Set(
    S1_DOMAINS.map((d) => resolveDesignPackage({ domain: d.domain }).techniques.join(",")),
  );
  assert(techniqueSets.size >= 3, `esperado ≥3 sets de técnicas, obteve ${techniqueSets.size}`);
});

Deno.test("resolveDesignPackage — S1 cada domínio passa critic e tem read_paths", () => {
  for (const { id, domain } of S1_DOMAINS) {
    const pkg = resolveDesignPackage({ domain });
    assertEquals(pkg.critic.pass, true, `critic falhou para ${id}`);
    assert(pkg.compositions.length >= 3, `mínimo 3 compositions para ${id}, obteve ${pkg.compositions.length}`);
    assert(pkg.read_paths.length >= 3, `mínimo 3 read_paths para ${id}, obteve ${pkg.read_paths.length}`);
    assert(pkg.summary.length > 80, `summary curto para ${id}`);
  }
});

Deno.test("resolveDesignPackage — composições têm diversidade de seção (não repete mesma seção)", () => {
  for (const { id, domain } of S1_DOMAINS) {
    const pkg = resolveDesignPackage({ domain });
    assert(pkg.compositions.length >= 3, `mínimo 3 compositions para ${id}`);
    // Verifica que as composições são diferentes entre si
    const unique = new Set(pkg.compositions);
    assert(unique.size === pkg.compositions.length, `compositions duplicadas em ${id}`);
  }
});

Deno.test("resolveDesignPackage — 3-5 composições por pacote", () => {
  for (const { id, domain } of S1_DOMAINS) {
    const pkg = resolveDesignPackage({ domain });
    assert(
      pkg.compositions.length >= 3 && pkg.compositions.length <= 5,
      `${id}: esperado 3-5 compositions, obteve ${pkg.compositions.length}`,
    );
    assert(
      pkg.composition_exports.length === pkg.compositions.length,
      `${id}: composition_exports (${pkg.composition_exports.length}) ≠ compositions (${pkg.compositions.length})`,
    );
  }
});

Deno.test("resolveDesignPackage — rotationKey distingue projetos do mesmo domínio", () => {
  const a = resolveDesignPackage({ domain: "fintech saas", rotationKey: "project-alpha" });
  const b = resolveDesignPackage({ domain: "fintech saas", rotationKey: "project-beta" });
  const fingerprint = (p: ReturnType<typeof resolveDesignPackage>) =>
    [p.compositions.join(","), p.techniques.join(","), p.proposal.mood].join("|");
  assert(fingerprint(a) !== fingerprint(b));
});