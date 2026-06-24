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
  const compSigs = buildCompositionSignatures();
  const techSigs = buildTechniqueSignatures();

  for (let i = 0; i < input.expected.compositions.length; i++) {
    const compId = input.expected.compositions[i];
    const exportName = input.expected.composition_exports?.[i];
    const sig = compSigs.find((s) => s.id === compId);
    const exportPattern = exportName ? new RegExp(`<${exportName}[\\s/>]`) : null;
    const hasExport = exportPattern?.test(code) ?? false;
    const hasSig = sig?.pattern.test(code) ?? false;
    if (!hasExport && !hasSig) {
      missing.push(`composição ${compId}${exportName ? ` (${exportName})` : ""}`);
    }
  }

  for (const techId of input.expected.techniques) {
    const sig = techSigs.find((s) => s.id === techId);
    if (sig && !sig.patterns.some((p) => p.test(code))) {
      missing.push(`técnica ${techId}`);
    }
  }

  const heroPat = opinionatedHeroPattern();
  if (/HeroSignature/.test(code) && /BentoGrid/.test(code) && !heroPat.test(code)) {
    missing.push("anti-pattern HeroSignature+BentoGrid genérico");
  }

  let critic_warnings: string[] = [];
  if (input.expected.proposal) {
    const critic = reviewSynthesisFull(input.expected.proposal);
    if (!critic.pass) {
      for (const b of critic.blocks) missing.push(`critic: ${b}`);
    }
    critic_warnings = [...critic.warnings, ...critic.suggestions];
  }

  const pass = missing.length === 0;
  return {
    pass,
    missing,
    feedback: pass
      ? "Design validate OK — assinaturas do brief presentes"
      : `Craft incompleto — faltam: ${missing.join(", ")}`,
    critic_warnings: critic_warnings.length ? critic_warnings : undefined,
  };
}