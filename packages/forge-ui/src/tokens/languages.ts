/**
 * VisualLanguage — léxico de linguagens visuais com identidade própria.
 *
 * Cada linguagem é uma "alma" — não uma paleta de cores (isso é mood),
 * não um gesto isolado (isso é technique). É uma filosofia completa:
 * por que existe, quais princípios a definem, onde serve, com o que combina
 * e com o que conflita.
 *
 * O agente usa este léxico para PENSAR design. Sem vocabulário, ele só sabe
 * "bonito/feio". Com vocabulário, ele sabe "esta marca pede Swiss com
 * acabamento brutalist".
 */

export interface VisualLanguage {
  /** ID único (slug). */
  id: string;
  /** Nome exibível. */
  name: string;
  /** Filosofia — por que esta linguagem existe, em 1-2 frases. */
  philosophy: string;
  /** Princípios de execução — regras concretas que definem a linguagem. */
  principles: string[];
  /** Domínios onde esta linguagem encaixa bem. */
  serves: string[];
  /** Linguagens que combinam e ELEVAM (com reasoning). */
  combines_with: { id: string; reasoning: string; moment: string }[];
  /** Linguagens que CONFLITAM (anti-padrão de síntese). */
  conflicts_with: string[];
  /** Anti-padrões específicos desta linguagem. */
  anti_patterns: string[];
  /** Queries para web_research buscar exemplos reais desta linguagem. */
  reference_queries: string[];
  /** Moods que harmonizam com esta linguagem. */
  compatible_moods: string[];
}

export const VISUAL_LANGUAGES: Record<string, VisualLanguage> = {
  swiss: {
    id: "swiss",
    name: "Swiss International Style",
    philosophy: "Função acima de forma. Grid matemático rigoroso, tipografia grotesca, espaço negativo generoso. Clareza absoluta.",
    principles: [
      "Grid 12 colunas rígido — alinhamento perfeito",
      "Tipografia grotesca (Helvetica, Inter, Geist) sem serifa",
      "Espaço negativo generoso — respiro entre elementos",
      "Hierarquia por tamanho e peso, não por cor",
      "Fotografia reta, sem manipulação",
      "Sem decoração — cada elemento serve uma função",
    ],
    serves: ["SaaS", "fintech", "dashboard", "documentation", "enterprise", "data", "dev tools"],
    combines_with: [
      {
        id: "brutalist",
        reasoning: "Swiss traz disciplina e grid; Brutalist traz textura honesta e grão. Juntos = premium sem luxo falso.",
        moment: "Hero tipográfico com grid rígido + grain overlay sutil + textura de papel",
      },
      {
        id: "high-tech",
        reasoning: "Swiss traz clareza de informação; High-tech traz precisão técnica e acabamento digital. Juntos = SaaS enterprise sério.",
        moment: "Dashboard denso com grid perfeito + mesh gradient sutil + micro-interações precisas",
      },
      {
        id: "editorial",
        reasoning: "Swiss traz estrutura; Editorial traz hierarquia tipográfica e respiração. Juntos = documentação premium ou SaaS com story.",
        moment: "Hero split com headline serif display + body grotesca + grid rígido",
      },
    ],
    conflicts_with: ["memphis", "cyberpunk", "y2k"],
    anti_patterns: [
      "Gradient violeta-índigo (Swiss é mono ou restrained color)",
      "Glassmorphism heavy (Swiss prefere surfaces sólidas e claras)",
      "Decorative illustrations (Swiss usa fotografia ou nada)",
    ],
    reference_queries: [
      "swiss international style web design",
      "helvetica grid based website design awwwards",
      "minimal SaaS dashboard swiss design",
    ],
    compatible_moods: ["ocean", "mono", "ember"],
  },

  brutalist: {
    id: "brutalist",
    name: "Neo-Brutalism",
    philosophy: "Honestidade do material. Caos controlado. Cru, direto, sem verniz. O que você vê é o que é.",
    principles: [
      "Tipografia gigante — headlines que ocupam viewport inteiro",
      "Sem sombras suaves — borders hard ou nenhum",
      "Cores primárias chapadas (quando há cor)",
      "Grão/textura overlay — sensação de material real",
      "Grid intencionalmente quebrado ou assimétrico",
      "Raw HTML feel — bordas retas, sem rounded corners excessivas",
    ],
    serves: ["creative agency", "studio", "portfolio", "artisanal", "brand", "fashion", "art", "music"],
    combines_with: [
      {
        id: "editorial",
        reasoning: "Editorial traz hierarquia e respiração; Brutalist traz textura e honestidade. Juntos = marca artesanal premium.",
        moment: "Hero tipográfico gigante com grain + sticky stack de produtos com parallax sutil",
      },
      {
        id: "swiss",
        reasoning: "Swiss traz disciplina e grid; Brutalist traz ousadia tipográfica. Juntos = SaaS com personalidade.",
        moment: "Grid rígido + headline gigante + grain sutil + sem decoração",
      },
      {
        id: "japanese-minimalism",
        reasoning: "Japanese minimalism traz vazio e contenção; Brutalist traz textura. Juntos = arte minimal com alma.",
        moment: "Muito espaço vazio + 1 elemento brutalist com grão + tipografia discreta",
      },
    ],
    conflicts_with: ["art-deco", "royal", "luxury"],
    anti_patterns: [
      "Sombras suaves e difusas (Brutalist é hard shadow ou nada)",
      "Rounded corners excessivas (Brutalist é edges retas ou mínimo radius)",
      "Glassmorphism (Brutalist é opaque, honesto)",
      "Gradient suave (Brutalist é cor chapada ou mono)",
    ],
    reference_queries: [
      "brutalist web design awwwards 2024",
      "neo brutalism website typography giant",
      "raw HTML aesthetic web design",
    ],
    compatible_moods: ["mono", "sand", "ember", "sunset"],
  },

  editorial: {
    id: "editorial",
    name: "Editorial Magazine",
    philosophy: "Hierarquia tipográfica conta história. Respiração entre elementos. Serifa display + sans-serif body. Colunas assimétricas.",
    principles: [
      "Serifa display no headline (Playfair, Bodoni, ou similar)",
      "Sans-serif no body (Inter, Söhne) com line-height generoso (1.6-1.8)",
      "Colunas assimétricas — texto estreito, visual largo",
      "Whitespace como elemento de design — não medo do vazio",
      "Hierarquia por contraste tipográfico, não por cor",
      "Captions e metadata em small caps ou italic",
    ],
    serves: ["magazine", "fashion", "lifestyle", "editorial", "luxury", "beauty", "art", "culture"],
    combines_with: [
      {
        id: "brutalist",
        reasoning: "Editorial traz hierarquia; Brutalist traz textura. Juntos = marca artesanal premium.",
        moment: "Serif display gigante + grain overlay + sticky stack narrative",
      },
      {
        id: "swiss",
        reasoning: "Editorial traz story; Swiss traz estrutura. Juntos = SaaS com narrativa.",
        moment: "Split editorial com grid Swiss + serif headline + grotesk body",
      },
      {
        id: "japanese-minimalism",
        reasoning: "Editorial traz hierarquia; Japanese minimalism traz vazio. Juntos = editorial zen.",
        moment: "Serif headline + muito vazio + 1 visual discreto + grain sutil",
      },
    ],
    conflicts_with: ["cyberpunk", "memphis", "y2k", "neon"],
    anti_patterns: [
      "Gradient neon (Editorial é sofisticado, não brilhante)",
      "Glassmorphism (Editorial é papel, não vidro)",
      "Kinetic typography agressivo (Editorial é calmo, revela sutil)",
      "3-card grid simétrico (Editorial é assimétrico por natureza)",
    ],
    reference_queries: [
      "editorial magazine website design vogue style",
      "serif display headline website design awwwards",
      "asymmetric column layout web design premium",
    ],
    compatible_moods: ["mono", "sunset", "royal", "sand", "ember"],
  },

  "high-tech": {
    id: "high-tech",
    name: "High-Tech Industrial",
    philosophy: "Precisão técnica. Acabamento digital impecável. Dieter Rams meets web. Menos, mas melhor.",
    principles: [
      "Mesh gradient animado sutil no bg (conic ou radial)",
      "Grid pattern overlay como textura técnica",
      "Tipografia grotesca tight tracking (-0.03em)",
      "Micro-interações precisas (hover, magnetic, spotlight)",
      "Dark mode dominante com accent vibrante",
      "Code snippets e syntax highlight como elementos de design",
    ],
    serves: ["SaaS", "dev tools", "AI", "platform", "infrastructure", "cloud", "API", "tech product"],
    combines_with: [
      {
        id: "swiss",
        reasoning: "High-tech traz acabamento; Swiss traz clareza. Juntos = SaaS enterprise de altíssimo nível.",
        moment: "Grid Swiss + mesh gradient + code blocks + micro-interações precisas",
      },
      {
        id: "minimal",
        reasoning: "High-tech traz precisão; Minimal traz contenção. Juntos = tech premium discreto.",
        moment: "Mesh sutil + mono color + 1 accent + typography tight",
      },
    ],
    conflicts_with: ["memphis", "art-deco", "editorial", "japanese-minimalism"],
    anti_patterns: [
      "Serifa display (High-tech é grotesk only)",
      "Grain texture (High-tech é digital puro, sem analog)",
      "Colunas assimétricas editoriais (High-tech é grid técnico)",
    ],
    reference_queries: [
      "vercel linear stripe website design",
      "high tech SaaS landing page design 2024",
      "mesh gradient dark mode website design",
    ],
    compatible_moods: ["ocean", "mono", "neon", "ember"],
  },

  "japanese-minimalism": {
    id: "japanese-minimalism",
    name: "Japanese Minimalism (Ma)",
    philosophy: "Ma — o vazio entre elementos é tão importante quanto os elementos. Contenção extrema. Kenya Hara.",
    principles: [
      "Espaço negativo DOMINA — 60-70% da tela é vazio",
      "1 elemento por seção — sem clusters, sem grids densos",
      "Paleta mono + 1 accent natural (areia, terra, cinza)",
      "Tipografia discreta — peso light, tracking normal",
      "Motion sutil — reveal lento, sem parallax agressivo",
      "Materialidade — textura sutil de papel, madeira, tecido",
    ],
    serves: ["wellness", "zen", "tea", "ceramics", "fashion minimal", "architecture", "art", "philosophy"],
    combines_with: [
      {
        id: "brutalist",
        reasoning: "Japanese minimalism traz vazio; Brutalist traz textura. Juntos = arte minimal com alma material.",
        moment: "1 elemento brutalist com grain + 70% vazio + tipografia discreta",
      },
      {
        id: "editorial",
        reasoning: "Japanese minimalism traz contenção; Editorial traz hierarquia. Juntos = editorial zen.",
        moment: "Serif headline + muito vazio + 1 visual + grain sutil",
      },
    ],
    conflicts_with: ["cyberpunk", "memphis", "y2k", "high-tech", "neon"],
    anti_patterns: [
      "Mesh gradient animado (Japanese minimalism é estático, calmo)",
      "Multiple cards em grid (Japanese minimalism é 1 elemento por seção)",
      "Neon glow (Japanese minimalism é natural, não digital)",
      "Kinetic typography (Japanese minimalism é slow reveal, não aggressive)",
    ],
    reference_queries: [
      "japanese minimalism web design ma",
      "kenya hara design philosophy website",
      "zen minimal website design premium",
    ],
    compatible_moods: ["mono", "sand", "forest"],
  },

  bauhaus: {
    id: "bauhaus",
    name: "Bauhaus Geometric",
    philosophy: "Forma segue função. Geometria primária — círculo, quadrado, triângulo. Cor primária — vermelho, azul, amarelo. Sem ornamentação.",
    principles: [
      "Formas geométricas primárias como elementos visuais",
      "Cores primárias (vermelho, azul, amarelo) + preto e branco",
      "Grid rigoroso baseado em geometria",
      "Tipografia sans-serif geométrica (Futura, Avenir)",
      "Sem ilustração figurativa — apenas geometria abstrata",
      "Composição equilibrada mas dinâmica",
    ],
    serves: ["art school", "design education", "architecture", "creative", "brand", "poster", "cultural"],
    combines_with: [
      {
        id: "swiss",
        reasoning: "Bauhaus traz geometria; Swiss traz grid. Juntos = design educacional premium.",
        moment: "Grid Swiss + formas geométricas + cores primárias + sans-serif geométrica",
      },
      {
        id: "brutalist",
        reasoning: "Bauhaus traz geometria; Brutalist traz ousadia. Juntos = design com atitude.",
        moment: "Formas geométricas gigantes + grain + cores primárias chapadas",
      },
    ],
    conflicts_with: ["editorial", "japanese-minimalism", "art-deco"],
    anti_patterns: [
      "Serifa display (Bauhaus é sans-serif geométrica)",
      "Gradient suave (Bauhaus é cor chapada primária)",
      "Fotografia realista (Bauhaus é geometria abstrata)",
    ],
    reference_queries: [
      "bauhaus web design geometric",
      "primary colors geometric website design",
      "bauhaus poster style web design modern",
    ],
    compatible_moods: ["ember", "ocean", "sunset", "mono"],
  },

  cyberpunk: {
    id: "cyberpunk",
    name: "Cyberpunk Terminal",
    philosophy: "Futuro distópico. Neon sobre escuro. Glitch e distorção. Terminal aesthetic. Alta energia.",
    principles: [
      "Neon vibrante sobre bg ultra-escuro (neon green, magenta, cyan)",
      "Tipografia monospace ou display tech (JetBrains Mono, Space Mono)",
      "Glitch effects — RGB split, scanlines, distortion",
      "Grid pattern ou scanline overlay como textura",
      "Motion agressivo — flicker, glitch, instant transitions",
      "UI elements como terminal — prompts, cursors, code blocks",
    ],
    serves: ["gaming", "web3", "crypto", "hacker", "tech extreme", "music electronic", "cyberpunk"],
    combines_with: [
      {
        id: "high-tech",
        reasoning: "Cyberpunk traz energia; High-tech traz precisão. Juntos = tech product com atitude.",
        moment: "Mesh gradient + neon glow + monospace + glitch sutil em transições",
      },
    ],
    conflicts_with: ["editorial", "japanese-minimalism", "swiss", "art-deco", "brutalist"],
    anti_patterns: [
      "Serifa display elegante (Cyberpunk é monospace ou display tech)",
      "Whitespace generoso (Cyberpunk é denso, agressivo)",
      "Cores pastel (Cyberpunk é neon vibrante)",
      "Grain texture sutil (Cyberpunk é glitch, scanlines, RGB split)",
    ],
    reference_queries: [
      "cyberpunk website design neon",
      "terminal aesthetic web design",
      "glitch effect website design awwwards",
    ],
    compatible_moods: ["neon", "mono"],
  },

  "art-deco": {
    id: "art-deco",
    name: "Art Deco Luxury",
    philosophy: "Elegância geométrica. Simetria, padrões radiais, gold foil. Anos 20 modernizados. Sofisticação absoluta.",
    principles: [
      "Simetria rigorosa — espelhamento horizontal e vertical",
      "Gold foil ou metallic accents (dourado, prateado, rose gold)",
      "Padrões geométricos radiais e zigzag",
      "Tipografia display elegante (Didot, Bodoni) com tracking wide",
      "Bg escuro profundo com gold overlay",
      "Ornamentação geométrica — leques, raios, zigzags",
    ],
    serves: ["luxury", "jewelry", "real estate premium", "hotel", "fine dining", "fashion luxury", "event"],
    combines_with: [
      {
        id: "editorial",
        reasoning: "Art deco traz ornamentação; Editorial traz hierarquia. Juntos = luxury magazine.",
        moment: "Serif display + gold accents + padrão radial + coluna editorial assimétrica",
      },
    ],
    conflicts_with: ["brutalist", "cyberpunk", "memphis", "y2k", "japanese-minimalism"],
    anti_patterns: [
      "Grotesk sans-serif (Art deco é serif display elegante)",
      "Grain texture (Art deco é polido, perfeito)",
      "Monospace (Art deco é display elegante)",
      "Raw HTML feel (Art deco é ornamentado)",
    ],
    reference_queries: [
      "art deco luxury website design",
      "gold foil geometric website design",
      "1920s modern luxury web design",
    ],
    compatible_moods: ["royal", "sunset", "mono"],
  },

  memphis: {
    id: "memphis",
    name: "Memphis Post-Modern",
    philosophy: "Caos alegre. Formas geométricas lúdicas, cores vibrantes, padrões absurdos. Reação ao minimalismo.",
    principles: [
      "Cores vibrantes e contrastantes (rosa, azul, amarelo, verde)",
      "Formas geométricas lúdicas — círculos, zigzags, squiggles",
      "Padrões absurdos e assímetricos",
      "Tipografia bold e playful",
      "Mix de texturas e materiais visuais",
      "Quebra intencional de grid e hierarquia",
    ],
    serves: ["creative", "kids", "fun brand", "music", "art", "event", "playful product"],
    combines_with: [],
    conflicts_with: ["swiss", "japanese-minimalism", "art-deco", "high-tech", "editorial"],
    anti_patterns: [
      "Grid rígido (Memphis é caos controlado)",
      "Mono color (Memphis é vibrante)",
      "Whitespace generoso (Memphis é denso e caótico)",
      "Serif display elegante (Memphis é bold playful)",
    ],
    reference_queries: [
      "memphis design web design colorful",
      "post modern playful website design",
      "memphis group aesthetic web modern",
    ],
    compatible_moods: ["sunset", "neon", "ember", "forest"],
  },

  "y2k": {
    id: "y2k",
    name: "Y2K Retro-Futurist",
    philosophy: "Anos 2000 reimaginados. Chrome, holografia, blob shapes, tech optimism. Nostalgia do futuro.",
    principles: [
      "Chrome e metallic gradients (prateado, holográfico)",
      "Blob shapes e formas orgânicas com CSS",
      "Tipografia tech round (Eurostile, Chakra Petch)",
      "Bg com gradient holográfico ou iridescent",
      "UI elements com gloss e reflection",
      "Motion com spring physics — bouncy, playful",
    ],
    serves: ["music", "fashion young", "gaming", "web3", "creative young", "social", "trend brand"],
    combines_with: [
      {
        id: "cyberpunk",
        reasoning: "Y2K traz nostalgia do futuro; Cyberpunk traz distopia. Juntos = retro-futurist com atitude.",
        moment: "Chrome gradient + neon glow + blob shapes + glitch sutil",
      },
    ],
    conflicts_with: ["swiss", "editorial", "japanese-minimalism", "art-deco"],
    anti_patterns: [
      "Serif display (Y2K é tech round)",
      "Monochrome (Y2K é holográfico, iridescent)",
      "Grid rígido (Y2K é blob shapes, orgânico)",
      "Grain texture (Y2K é chrome, gloss, polished)",
    ],
    reference_queries: [
      "y2k aesthetic web design chrome",
      "retro futurist website design 2000s",
      "holographic gradient web design modern",
    ],
    compatible_moods: ["neon", "sunset", "ocean"],
  },

  organic: {
    id: "organic",
    name: "Organic Natural",
    philosophy: "Formas da natureza. Curvas, fluxo, biomória. Paleta terrosa. Conexão com o natural.",
    principles: [
      "Curvas e formas orgânicas (border-radius generoso, blob shapes)",
      "Paleta terrosa — terra, areia, verde natural, marrom",
      "Tipografia humanista sans-serif (Söhne, Suisse Int'l)",
      "Fotografia de natureza e texturas orgânicas",
      "Motion fluido — spring physics, curves naturais",
      "Whitespace generoso com elementos que fluem",
    ],
    serves: ["eco", "health", "wellness", "food organic", "nature", "skincare", "sustainable", "yoga"],
    combines_with: [
      {
        id: "japanese-minimalism",
        reasoning: "Organic traz formas naturais; Japanese minimalism traz vazio. Juntos = wellness zen.",
        moment: "Blob shapes + paleta terrosa + muito vazio + motion fluido",
      },
      {
        id: "editorial",
        reasoning: "Organic traz fluidez; Editorial traz hierarquia. Juntos = lifestyle magazine natural.",
        moment: "Serif display + curvas orgânicas + fotografia natural + coluna editorial",
      },
    ],
    conflicts_with: ["cyberpunk", "memphis", "y2k", "high-tech"],
    anti_patterns: [
      "Neon vibrante (Organic é terroso, natural)",
      "Grid rígido (Organic é fluido, curvas)",
      "Monospace (Organic é humanista)",
      "Glitch effects (Organic é suave, natural)",
    ],
    reference_queries: [
      "organic natural website design curves",
      "biomorphic web design eco wellness",
      "nature inspired website design premium",
    ],
    compatible_moods: ["sand", "forest", "ember", "sunset"],
  },

  minimal: {
    id: "minimal",
    name: "Pure Minimal",
    philosophy: "Menos é mais. Redução ao essencial. Um elemento, um gesto, máxima elegância.",
    principles: [
      "1 elemento por seção — máximo 2",
      "Paleta mono + 1 accent máximo",
      "Tipografia minimal (1 peso, 1 tamanho para cada nível)",
      "Whitespace EXTREMO — 70%+ da tela é vazio",
      "Motion sutil — fade lento, sem parallax",
      "Sem decoração — cada elemento é essencial",
    ],
    serves: ["portfolio", "brand minimal", "product minimal", "agency minimal", "studio", "photographer"],
    combines_with: [
      {
        id: "high-tech",
        reasoning: "Minimal traz contenção; High-tech traz precisão. Juntos = tech premium discreto.",
        moment: "Mesh sutil + mono color + 1 accent + typography tight",
      },
      {
        id: "japanese-minimalism",
        reasoning: "Minimal traz redução; Japanese minimalism traz filosofia. Juntos = zen absoluto.",
        moment: "1 elemento + 70% vazio + grain sutil + tipografia light",
      },
    ],
    conflicts_with: ["memphis", "cyberpunk", "y2k", "bauhaus", "art-deco"],
    anti_patterns: [
      "Múltiplos cards em grid (Minimal é 1 elemento)",
      "Gradient colorido (Minimal é mono + 1 accent)",
      "Kinetic typography agressivo (Minimal é slow fade)",
      "Parallax multi-layer (Minimal é flat, contido)",
    ],
    reference_queries: [
      "minimal website design awwwards",
      "pure minimal portfolio website",
      "extreme whitespace web design",
    ],
    compatible_moods: ["mono", "ocean", "sand"],
  },
};

export const VISUAL_LANGUAGE_IDS = Object.keys(VISUAL_LANGUAGES);

export function isVisualLanguage(id: string): id is keyof typeof VISUAL_LANGUAGES {
  return id in VISUAL_LANGUAGES;
}

/**
 * Resumo compacto de uma linguagem para o prompt do LLM.
 */
export function languageSummary(lang: VisualLanguage): string {
  const combines = lang.combines_with.length > 0
    ? lang.combines_with.map((c) => `${c.id} (${c.moment})`).join(", ")
    : "nenhuma";
  return [
    `${lang.name} (${lang.id})`,
    `  Filosofia: ${lang.philosophy}`,
    `  Princípios: ${lang.principles.slice(0, 3).join("; ")}`,
    `  Serve: ${lang.serves.join(", ")}`,
    `  Combina com: ${combines}`,
    `  Conflita com: ${lang.conflicts_with.join(", ") || "nenhuma"}`,
  ].join("\n");
}

/**
 * Catálogo completo de linguagens para o prompt do agente.
 */
export function languageCatalogSummary(): string {
  return VISUAL_LANGUAGE_IDS.map((id) => languageSummary(VISUAL_LANGUAGES[id])).join("\n\n");
}

/**
 * Heurística leve — sugere linguagens por domínio.
 */
export function suggestLanguagesForDomain(domain: string): string[] {
  const d = domain.toLowerCase();
  const matches: string[] = [];

  for (const [id, lang] of Object.entries(VISUAL_LANGUAGES)) {
    if (lang.serves.some((s) => {
      const sLower = s.toLowerCase();
      return d.includes(sLower) || sLower.includes(d);
    })) {
      matches.push(id);
    }
  }

  // Fallbacks por keyword
  if (matches.length === 0) {
    if (/\b(bakery|padaria|food|cafe|coffee|artisanal|craft)\b/.test(d)) {
      matches.push("brutalist", "editorial", "organic");
    } else if (/\b(saas|fintech|tech|dashboard|dev)\b/.test(d)) {
      matches.push("swiss", "high-tech", "minimal");
    } else if (/\b(fashion|beauty|magazine|lifestyle)\b/.test(d)) {
      matches.push("editorial", "art-deco", "minimal");
    } else if (/\b(gaming|crypto|web3|hacker)\b/.test(d)) {
      matches.push("cyberpunk", "y2k", "high-tech");
    } else if (/\b(eco|wellness|yoga|nature)\b/.test(d)) {
      matches.push("organic", "japanese-minimalism", "minimal");
    } else if (/\b(agency|studio|portfolio|creative)\b/.test(d)) {
      matches.push("brutalist", "editorial", "swiss");
    } else {
      matches.push("swiss", "editorial");
    }
  }

  return matches;
}
