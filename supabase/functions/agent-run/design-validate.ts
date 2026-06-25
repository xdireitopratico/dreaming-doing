// design-validate.ts — Valida assinaturas de craft no código gerado.
import { reviewSynthesisFull } from "./design-critic-edge.ts";
import {
  buildCompositionSignatures,
  buildTechniqueSignatures,
  opinionatedHeroPattern,
} from "./design-validate-signatures.ts";
import type { CriticProposal } from "./design-critic-edge.ts";
import type { DesignResolvePackage } from "./design-resolve.ts";

export type ValidateResult = {
  pass: boolean;
  missing: string[];
  feedback: string;
  critic_warnings?: string[];
};

export function validateDesignImplementation(input: {
  expected: Pick<DesignResolvePackage, "compositions" | "techniques" | "composition_exports"> & {
    proposal?: CriticProposal;
  };
  files: Map<string, string>;
}): ValidateResult {
  const code = [...input.files.values()].join("\n");
  const missing: string[] = [];
  const divergences: string[] = [];
  const compSigs = buildCompositionSignatures();
  const techSigs = buildTechniqueSignatures();

  // ponytail: craft é CRAFT, não conformidade. A página pode substituir livremente as
  // composições/técnicas prescritas por outras melhores — é o COMPOSTO CRIACIONAL.
  // Divergências viram AVISO, jamais bloqueio.
  for (let i = 0; i < input.expected.compositions.length; i++) {
    const compId = input.expected.compositions[i];
    const exportName = input.expected.composition_exports?.[i];
    const sig = compSigs.find((s) => s.id === compId);
    const exportPattern = exportName ? new RegExp(`<${exportName}[\\s/>]`) : null;
    const hasExport = exportPattern?.test(code) ?? false;
    const hasSig = sig?.pattern.test(code) ?? false;
    if (!hasExport && !hasSig) {
      divergences.push(`composição ${compId}${exportName ? ` (${exportName})` : ""} substituída/não usada`);
    }
  }

  for (const techId of input.expected.techniques) {
    const sig = techSigs.find((s) => s.id === techId);
    if (sig && !sig.patterns.some((p) => p.test(code))) {
      divergences.push(`técnica ${techId} substituída/não usada`);
    }
  }

  // 1. Bloqueante HARD — anti-padrão genérico ("Volkswagen factory"). Rede anti-template.
  const heroPat = opinionatedHeroPattern();
  if (/HeroSignature/.test(code) && /BentoGrid/.test(code) && !heroPat.test(code)) {
    missing.push("anti-pattern HeroSignature+BentoGrid genérico");
  }

  // 2. Bloqueante HARD — ausência TOTAL de ofício: nenhum composite nem técnica detectados.
  // "Mediano é inaceitável": substituir por outras é livre; não ter NENHUMA é página rasa.
  const anyCompositeUsed = compSigs.some((s) => s.pattern.test(code));
  const anyTechniqueUsed = techSigs.some((s) => s.patterns.some((p) => p.test(code)));
  if (!anyCompositeUsed && !anyTechniqueUsed) {
    missing.push("nenhum composite nem técnica @forge/ui detectados — página sem ofício");
  }

  let critic_warnings: string[] = [];
  if (input.expected.proposal) {
    const critic = reviewSynthesisFull(input.expected.proposal);
    if (!critic.pass) {
      for (const b of critic.blocks) missing.push(`critic: ${b}`);
    }
    critic_warnings = [...critic.warnings, ...critic.suggestions];
  }
  if (divergences.length) {
    critic_warnings = [...critic_warnings, `substituições criativas (ok, não bloqueia): ${divergences.join("; ")}`];
  }

  const pass = missing.length === 0;
  return {
    pass,
    missing,
    feedback: pass
      ? "Design validate OK — ofício presente (composições/técnicas podem divergir do brief)"
      : `Craft insuficiente — bloqueios: ${missing.join(", ")}`,
    critic_warnings: critic_warnings.length ? critic_warnings : undefined,
  };
}