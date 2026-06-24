// plan-design-enrich.ts — Auto-resolve design para planos UI sem campo design.
import { resolveDesignPackage } from "./design-resolve.ts";
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
  if (plan.design?.voice?.length && plan.design.moment?.trim()) return plan;

  const pkg = resolveDesignPackage({ domain: domain.trim() || plan.summary, rotationKey: plan.planId });
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