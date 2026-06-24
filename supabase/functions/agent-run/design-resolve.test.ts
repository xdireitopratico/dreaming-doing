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

Deno.test("resolveDesignPackage — 5 domínios geram variação", () => {
  const domains = ["fintech", "padaria", "gaming cyber", "yoga wellness", "fashion boutique"];
  const sets = new Set(domains.map((d) => resolveDesignPackage({ domain: d }).compositions[0]));
  assert(sets.size >= 3);
});