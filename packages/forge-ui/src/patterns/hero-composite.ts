/** Composição hero assinatura — eyebrow + headline display + dual CTA + proof strip. */

export const HERO_VARIANTS = ["aurora", "mesh", "minimal", "split"] as const;
export type HeroVariant = (typeof HERO_VARIANTS)[number];

export const heroCompositionGuide = `
HeroSignature deve incluir:
- eyebrow com Badge + ícone ou pulse
- h1 font-display com gradiente ou tracking tight
- subhead text-muted-foreground max-w-2xl
- par de CTAs: Button primary + Button outline/ghost
- StatsRibbon ou proof strip abaixo do fold
- FadeIn + StaggerContainer na entrada
- fundo: mesh/aurora com surface layers — nunca branco
`;
