// plan-design-enrich.ts — Auto-resolve design para planos UI sem campo design.
import { dnaIdsFromReferences, resolveDesignPackage } from "./design-resolve.ts";
import type { DesignPlanField, ProposedPlan } from "./types.ts";

const WEB_UI_TEMPLATES = new Set([
  "vite-react",
  "nextjs-app-router",
  "tanstack-start",
  "expo",
  "astro",
  "node-api",
  "static-html",
  "custom",
]);

export function enrichProposedPlanDesign(
  plan: ProposedPlan,
  domain: string,
  projectTemplate: string,
): ProposedPlan {
  if (!WEB_UI_TEMPLATES.has(projectTemplate)) return plan;

  const domainLabel = domain.trim() || plan.summary;
  const extractedDnaIds = dnaIdsFromReferences(plan.design?.references);

  if (plan.design?.voice?.length && plan.design.moment?.trim()) {
    if (extractedDnaIds.length && !plan.design.relevant_dnas?.length) {
      const pkg = resolveDesignPackage({
        domain: domainLabel,
        rotationKey: plan.planId,
        extractedDnaIds,
      });
      return {
        ...plan,
        design: { ...plan.design, relevant_dnas: pkg.relevant_dnas },
      };
    }
    return plan;
  }

  const pkg = resolveDesignPackage({
    domain: domainLabel,
    rotationKey: plan.planId,
    extractedDnaIds: extractedDnaIds.length ? extractedDnaIds : undefined,
  });
  const design: DesignPlanField = {
    voice: pkg.proposal.voice,
    moment: pkg.proposal.moment,
    techniques: pkg.techniques,
    mood: pkg.proposal.mood,
    compositions: pkg.compositions,
    composition_exports: pkg.composition_exports,
    relevant_dnas: pkg.relevant_dnas,
    read_paths: pkg.read_paths,
    anti_patterns: pkg.anti_patterns,
    synthesis_reasoning: pkg.proposal.reasoning,
  };
  return { ...plan, design };
}