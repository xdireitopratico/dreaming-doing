/**
 * OpinionatedComposition — metadata para composições opinativas.
 *
 * Cada composição é um template gerativo com código testado, guardrails,
 * e mapeamento para voice/moment/techniques do synthesis engine.
 * O agent SELECTS e ADAPTA — não copia cego.
 */

export interface OpinionatedComposition {
  id: string;
  name: string;
  voice: string[];
  moment: string;
  techniques: string[];
  compatible_moods: string[];
  guardrails: string[];
  /** Path do arquivo de código (relativo a packages/forge-ui/src/) */
  code_path: string;
  /** Props que o agent pode customizar */
  props: string[];
}

export const COMPOSITIONS: OpinionatedComposition[] = [
  {
    id: "hero-editorial-split",
    name: "Hero Editorial Split",
    voice: ["editorial", "brutalist"],
    moment: "Serif display gigante à esquerda + visual/grão à direita + grain overlay",
    techniques: ["scroll-reveal", "grain-texture-overlay", "parallax-depth"],
    compatible_moods: ["mono", "sand", "ember", "sunset"],
    guardrails: [
      "NÃO centralizar — split 60/40 ou 40/60 obrigatório",
      "Serif no headline, sans-serif no body",
      "Grain overlay opacity 0.03-0.05",
      "Sem glassmorphism — surfaces sólidas",
    ],
    code_path: "compositions/opinionated/HeroEditorialSplit.tsx",
    props: ["eyebrow", "title", "subtitle", "primaryCta", "secondaryCta", "visual", "grainIntensity"],
  },
  {
    id: "hero-brutalist-typography",
    name: "Hero Brutalist Typography",
    voice: ["brutalist"],
    moment: "Tipografia gigante full-viewport com kinetic reveal + grain — type IS the design",
    techniques: ["kinetic-typography", "grain-texture-overlay"],
    compatible_moods: ["mono", "sand", "ember", "sunset"],
    guardrails: [
      "NÃO usar cards, bento, ou features grid no hero",
      "Headline ocupa 80%+ do viewport",
      "Tracking tight (-0.03em a -0.04em)",
      "Line-height 0.9-0.95 (densidade brutalist)",
      "Sem gradient suave — cor chapada ou mono",
    ],
    code_path: "compositions/opinionated/HeroBrutalistTypography.tsx",
    props: ["title", "subtitle", "cta", "accentWord", "bgColor", "textColor", "grainOpacity"],
  },
  {
    id: "hero-cinematic-spotlight",
    name: "Hero Cinematic Spotlight",
    voice: ["high-tech", "editorial"],
    moment: "Product/visual centrado + parallax 3-layer + spotlight cursor + mesh gradient bg",
    techniques: ["parallax-depth", "spotlight-cursor", "animated-mesh-background"],
    compatible_moods: ["ocean", "mono", "neon", "ember"],
    guardrails: [
      "Product/visual deve ser o foco — headline complementa, não domina",
      "Parallax max 3 camadas (performance)",
      "Spotlight radius 300-500px",
      "Mesh gradient animado no bg (não no texto)",
      "Dark mode dominante",
    ],
    code_path: "compositions/opinionated/HeroCinematicSpotlight.tsx",
    props: ["eyebrow", "title", "subtitle", "primaryCta", "productVisual", "meshColors", "spotlightRadius"],
  },
  {
    id: "sticky-stack-narrative",
    name: "Sticky Stack Narrative",
    voice: ["editorial", "swiss"],
    moment: "Coluna sticky à esquerda (título + descrição) + coluna scroll à direita (items com visual)",
    techniques: ["sticky-stack", "scroll-reveal", "parallax-depth"],
    compatible_moods: ["mono", "ocean", "sand", "ember", "forest"],
    guardrails: [
      "Sticky col: position sticky + height 100vh",
      "Mobile: stack (col esquerda vira header)",
      "Max 5 items na scroll col",
      "Parallax sutil no visual (0.3x-0.7x)",
    ],
    code_path: "compositions/opinionated/StickyStackNarrative.tsx",
    props: ["stickyTitle", "stickyDescription", "items", "parallaxDepth"],
  },
  {
    id: "bento-dense-showcase",
    name: "Bento Dense Showcase",
    voice: ["swiss", "high-tech"],
    moment: "Grid 4-col assimétrico com cards de tamanhos variados + spotlight cursor no bento",
    techniques: ["spotlight-cursor", "scroll-reveal", "stagger"],
    compatible_moods: ["ocean", "mono", "ember", "sand"],
    guardrails: [
      "Card destaque: col-span-2 row-span-2",
      "Max 8 cards no bento",
      "Spotlight radius 300px dentro do bento",
      "Grid: grid-cols-4 auto-rows-[200px] em desktop",
      "Mobile: 1 coluna, cards empilhados",
    ],
    code_path: "compositions/opinionated/BentoDenseShowcase.tsx",
    props: ["highlightCard", "cards", "columns", "spotlightEnabled"],
  },
  {
    id: "editorial-magazine-split",
    name: "Editorial Magazine Split",
    voice: ["editorial"],
    moment: "Coluna estreita de texto (3 col) + visual fotográfico largo (9 col) + serif display",
    techniques: ["scroll-reveal", "parallax-depth"],
    compatible_moods: ["mono", "sunset", "royal", "sand", "ember"],
    guardrails: [
      "Grid 3+9 col (texto 3, visual 9)",
      "Serif display no headline (Playfair, Bodoni)",
      "Sans-serif no body com line-height 1.6-1.8",
      "Visual domina — texto complementa",
      "Mobile: visual first, texto abaixo",
      "Sem gradient — fotografia é a cor",
    ],
    code_path: "compositions/opinionated/EditorialMagazineSplit.tsx",
    props: ["headline", "subhead", "bodyText", "visual", "caption", "invertColumns"],
  },
  {
    id: "kinetic-headline-reveal",
    name: "Kinetic Headline Reveal",
    voice: ["brutalist", "editorial"],
    moment: "Headline gigante com reveal por máscara (palavra por palavra) + grain overlay + cursor custom",
    techniques: ["kinetic-typography", "grain-texture-overlay"],
    compatible_moods: ["mono", "ember", "sunset", "neon"],
    guardrails: [
      "Reveal por palavra (não por letra — muito lento)",
      "Stagger 0.12-0.15s entre palavras",
      "Easing cubic-bezier(0.16, 1, 0.3, 1)",
      "Duration 800-1200ms",
      "Grain sobre tudo (z-index máximo, pointer-events-none)",
      "Cursor custom: dot + outline ring com lag",
    ],
    code_path: "compositions/opinionated/KineticHeadlineReveal.tsx",
    props: ["words", "subtitle", "cta", "accentWordIndex", "grainOpacity", "cursorStyle"],
  },
  {
    id: "spotlight-showcase-grid",
    name: "Spotlight Showcase Grid",
    voice: ["swiss", "minimal"],
    moment: "Grid minimal de cards simples + spotlight cursor que cria profundidade radial",
    techniques: ["spotlight-cursor", "scroll-reveal"],
    compatible_moods: ["mono", "ocean", "ember"],
    guardrails: [
      "Cards minimal: border subtle, bg surface-1, sem shadow heavy",
      "Spotlight radius 400px",
      "Grid 2-3 col uniforme",
      "Tipografia discreta — spotlight faz o trabalho visual",
      "Hover: card brighten + border appear (não lift)",
    ],
    code_path: "compositions/opinionated/SpotlightShowcaseGrid.tsx",
    props: ["items", "columns", "spotlightRadius", "spotlightColor"],
  },
  {
    id: "parallax-product-showcase",
    name: "Parallax Product Showcase",
    voice: ["high-tech", "editorial"],
    moment: "3-layer parallax com product image + scroll-triggered reveals + mesh gradient bg",
    techniques: ["parallax-depth", "scroll-reveal", "animated-mesh-background"],
    compatible_moods: ["ocean", "mono", "ember", "neon", "sand"],
    guardrails: [
      "Max 3 parallax layers (performance mobile)",
      "Transform translateY only (não top/left)",
      "will-change: transform",
      "prefers-reduced-motion: desabilitar parallax",
      "Mesh gradient animado no bg layer (0.2x speed)",
    ],
    code_path: "compositions/opinionated/ParallaxProductShowcase.tsx",
    props: ["bgLayer", "midLayer", "productImage", "headline", "subhead", "cta", "parallaxSpeeds"],
  },
  {
    id: "glass-nav-floating",
    name: "Glass Nav Floating",
    voice: ["swiss", "high-tech"],
    moment: "Nav flutuante sticky top-4 com glassmorphism (backdrop-blur) + mesh bg atrás",
    techniques: ["glassmorphism-layers", "animated-mesh-background"],
    compatible_moods: ["ocean", "mono", "neon", "ember"],
    guardrails: [
      "CRÍTICO: glass SÓ funciona sobre mesh/parallax/gradient (precisa conteúdo animado atrás)",
      "NUNCA glass sobre bg chapado — blur não tem o que mostrar",
      "Nav: bg-surface-1/60 backdrop-blur-xl border-white/10 rounded-2xl",
      "Sticky top-4, max-w-5xl centered",
      "Mobile: hamburger, mantém glass",
    ],
    code_path: "compositions/opinionated/GlassNavFloating.tsx",
    props: ["logo", "links", "cta", "bgVariant", "rounded"],
  },
  {
    id: "grain-artisanal-overlay",
    name: "Grain Artisanal Overlay",
    voice: ["brutalist", "organic"],
    moment: "Overlay de grain texture sobre toda a página + tipografia com personalidade + paleta terrosa",
    techniques: ["grain-texture-overlay", "scroll-reveal"],
    compatible_moods: ["sand", "mono", "ember", "forest"],
    guardrails: [
      "Grain opacity 0.03-0.05 (sutil, não agressivo)",
      "mix-blend-mode: overlay",
      "pointer-events: none (não bloqueia cliques)",
      "z-index máximo (última camada)",
      "SVG noise filter ou PNG noise tile 200x200",
      "Funciona com qualquer layout — é overlay, não estrutura",
    ],
    code_path: "compositions/opinionated/GrainArtisanalOverlay.tsx",
    props: ["intensity", "blendMode", "tileSize", "children"],
  },
  {
    id: "section-tabs-feature-lanes",
    name: "Section Tabs Feature Lanes",
    voice: ["high-tech", "swiss"],
    moment: "Abas com preview visual por capacidade — Voice/Video/API lanes com swap animado",
    techniques: ["section-tabs-visual", "scroll-reveal", "magnetic-interaction"],
    compatible_moods: ["ocean", "mono", "neon", "ember"],
    guardrails: [
      "Máximo 4 tabs — mais que isso vira confusão",
      "Preview visual obrigatório em cada lane (não só texto)",
      "Tab ativa com contraste claro vs inativas",
      "Mobile: tabs scroll horizontal, preview abaixo",
    ],
    code_path: "compositions/opinionated/SectionTabsFeatureLanes.tsx",
    props: ["eyebrow", "title", "lanes", "defaultLaneId"],
  },
  {
    id: "process-steps-how-it-works",
    name: "Process Steps How It Works",
    voice: ["swiss", "editorial"],
    moment: "Steps numerados revelados no scroll — narrativa sequencial how-it-works",
    techniques: ["process-steps-scroll", "scroll-reveal", "count-up-metrics"],
    compatible_moods: ["ocean", "mono", "sand", "forest"],
    guardrails: [
      "3-5 passos — não mais que 5",
      "Numeração grande (01, 02) como âncora visual",
      "Uma coluna central — não grid 3-col genérico",
      "Cada step: título + 1-2 frases, não parágrafo longo",
    ],
    code_path: "compositions/opinionated/ProcessStepsHowItWorks.tsx",
    props: ["eyebrow", "title", "subtitle", "steps"],
  },
  {
    id: "faq-accordion-craft",
    name: "FAQ Accordion Craft",
    voice: ["editorial", "minimal"],
    moment: "FAQ com accordion craft — conversão sem parecer template de suporte",
    techniques: ["scroll-reveal"],
    compatible_moods: ["mono", "sand", "ocean", "ember"],
    guardrails: [
      "5-8 perguntas — qualidade > quantidade",
      "Respostas curtas (2-4 frases)",
      "Borda sutil + divide-y — não cards flutuantes genéricos",
      "Primeira pergunta aberta por default",
    ],
    code_path: "compositions/opinionated/FAQAccordionCraft.tsx",
    props: ["title", "subtitle", "items"],
  },
  {
    id: "interactive-hero-demo",
    name: "Interactive Hero Demo",
    voice: ["high-tech", "editorial"],
    moment: "Hero split com demo interativo embutido — produto visível, não só copy",
    techniques: ["interactive-demo-embed", "scroll-reveal", "spotlight-cursor"],
    compatible_moods: ["ocean", "neon", "mono", "ember"],
    guardrails: [
      "Demo ocupa ≥40% do hero em desktop",
      "Copy à esquerda, demo à direita (ou invertido com intenção)",
      "Demo deve ser funcional ou loop visual — nunca placeholder cinza",
      "CTA único primário — não 3 botões",
    ],
    code_path: "compositions/opinionated/InteractiveHeroDemo.tsx",
    props: ["eyebrow", "title", "subtitle", "primaryCta", "demo", "demoCaption"],
  },
];

/**
 * Encontra composições compatíveis com um voice + moment do synthesis engine.
 */
export function findCompositions(
  voice: string[],
  moment?: string,
  mood?: string,
): OpinionatedComposition[] {
  let matches = COMPOSITIONS.filter((comp) =>
    voice.some((v) => comp.voice.includes(v)),
  );

  if (mood) {
    const moodMatches = matches.filter((comp) => comp.compatible_moods.includes(mood));
    if (moodMatches.length > 0) matches = moodMatches;
  }

  return matches;
}

/**
 * Resumo do catálogo para o prompt do agente.
 */
export function compositionCatalogSummary(): string {
  return COMPOSITIONS.map((comp) => {
    return [
      `${comp.name} (${comp.id})`,
      `  Voice: ${comp.voice.join(" + ")}`,
      `  Moment: ${comp.moment}`,
      `  Techniques: ${comp.techniques.join(", ")}`,
      `  Moods: ${comp.compatible_moods.join(", ")}`,
      `  Guardrails: ${comp.guardrails.slice(0, 2).join("; ")}`,
    ].join("\n");
  }).join("\n\n");
}
