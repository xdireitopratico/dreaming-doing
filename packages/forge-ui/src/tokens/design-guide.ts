import { MOOD_IDS, MOODS, suggestMoodForDomain, type DesignMood } from "./moods";

/**
 * Princípios de design — ORIENTAÇÃO, não mandato. O agente tem liberdade para
 * adaptar ao contexto; estes são os critérios que separam "página de júnior"
 * de "página de profissional". Substitui o antigo anti-generic (que era código
 * morto e nunca chegava ao agente).
 */
export const DESIGN_PRINCIPLES = [
  "Identidade visual vem do mood em src/index.css — escolha um mood adequado ao domínio e edite os tokens. Nunca hardcoded hex em componentes.",
  "Ritmo vertical: alterne densidade e respiro entre seções (py-20 hero, py-12 densa, py-24 respirada). Sem isso a página é uma sopa plana.",
  "Hierarquia tipográfica clara: h1 display → h2 → h3, com contraste de tamanho e peso. O título do hero carrega a página.",
  "Camadas de superfície: use bg-background → bg-surface-1/2/3 para profundidade, nunca uma única cor chapada.",
  "Motion com intenção: revelar no scroll, parallax sutil, hover com física (spring). Motion excessivo ou ausente equally amador.",
  "Contraste de cor: texto legível sobre o fundo (foreground sobre background). CTA principal usa brand-500 com brand-500-foreground.",
  "Assinatura: cada página tem UM momento memorável (hero com glow, bento assimétrico, prova social). Não seja genérico — seja específico do domínio.",
  "Acessibilidade não é opcional: focus-visible, aria-label em ícones, contraste AA, alvo de toque >= 40px.",
] as const;

/** Resumo do catálogo de moods para o agente escolher. */
export function moodCatalogForPrompt(): string {
  return MOOD_IDS.map((id: DesignMood) => {
    const m = MOODS[id];
    return `- ${m.label} (${id}): ${m.when}${m.dark ? "" : " [claro]"}`;
  }).join("\n");
}

/**
 * Prompt orientacional de design — injetado no agente. Apresenta ferramentas
 * (moods, composites, motion) como CATÁLOGO disponível, não como exigência.
 * O agente adapta ao contexto do projeto.
 */
export function formatDesignGuidePrompt(domain?: string): string {
  const suggested = domain ? suggestMoodForDomain(domain) : null;
  const suggestion = suggested
    ? `\n\nMood sugerido para este domínio ("${domain}"): ${MOODS[suggested].label} (${suggested}). É uma sugestão — justifique se escolher outro.`
    : "";

  return `Você tem um design system completo em @forge/ui. Use-o como ferramenta, não como gaiola.

MOODS disponíveis (edite src/index.css com o @theme do mood escolhido):
${moodCatalogForPrompt()}
${suggestion}

PRINCÍPIOS de design (o que separa amador de profissional):
${DESIGN_PRINCIPLES.map((p, i) => `${i + 1}. ${p}`).join("\n")}

CATÁLOGO @forge/ui (use, modifique ou ignore conforme o contexto pede):
- Componentes: Button, Card, Badge, Dialog, Input, Avatar, Tooltip, Skeleton, Toast, Separator
- Motion: FadeIn, SlideIn, ScaleIn, StaggerContainer/Item, HoverLift, HoverScale, Reveal, Parallax, MagneticButton, TextShimmer
- Compositions (marketing): HeroSignature, BentoGrid, FeatureMatrix, CTASignature, StatsRibbon, PricingTiers, TestimonialCarousel, FooterColumns, NavShell

Landing/marketing pede riqueza visual (hero + bento + prova + CTA). App/dashboard pede clareza e densidade. Adapte — não aplique a mesma estrutura para tudo.`;
}
