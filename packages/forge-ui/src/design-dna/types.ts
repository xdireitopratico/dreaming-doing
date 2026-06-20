/**
 * DesignDNA — a "alma" extraída de um site de referência.
 *
 * Não é screenshot. Não é HTML cru. É o conjunto estruturado de átomos de design
 * que fazem aquele site funcionar: layout, motion, tipografia, aplicação de cor,
 * padrões de componente e vocabulário de interação.
 *
 * O LLM raciocina com DesignDNA, não com imagens. É o que permite síntese
 * (combinar DNAs de sites diferentes) em vez de imitação (copiar um site).
 */

export type DesignDNACategory =
  | "hero"
  | "layout"
  | "motion"
  | "typography"
  | "color_application"
  | "component_pattern"
  | "interaction"
  | "navigation"
  | "footer"
  | "full_page";

export interface MotionDNA {
  /** Tipos de motion presentes: parallax, stagger, reveal, magnetic, etc. */
  types: string[];
  /** Camadas de parallax com suas velocidades relativas (0.1 = lento, 1.0 = normal). */
  parallax_layers?: number[];
  /** Delay entre itens em stagger (segundos). */
  stagger?: number;
  /** Easing curve usado (ex: cubic-bezier(0.16,1,0.3,1)). */
  easing?: string;
  /** Duração típica de transições (ms). */
  duration?: number;
  /** Notas sobre coreografia de scroll. */
  scroll_choreography?: string;
}

export interface TypographyDNA {
  /** Font family stack (ex: "Inter Variable", "Helvetica Neue"). */
  font_stack?: string;
  /** Escala tipográfica (ex: "clamp(3rem, 8vw, 7rem)"). */
  scale?: string;
  /** Hierarquia de pesos (ex: [700, 500, 300]). */
  weight_hierarchy?: number[];
  /** Letter-spacing/tracking (ex: -0.02em). */
  tracking?: string;
  /** Line-height rhythm (ex: 1.1 for headlines, 1.6 for body). */
  line_height?: string;
  /** Uso de variable font (true/false). */
  variable_font?: boolean;
  /** Notas sobre tratamento tipográfico especial. */
  notes?: string;
}

export interface ColorApplicationDNA {
  /** Onde a brand color é aplicada (ex: "only on CTA", "headline gradient", "nav accent"). */
  brand_application?: string;
  /** Como as superfícies são layerizadas (ex: "bg-dark → surface-1 → surface-2 com borda sutil"). */
  surface_layering?: string;
  /** Uso de gradiente (onde, tipo, direção). */
  gradient_usage?: string;
  /** Cor de accent e onde aparece. */
  accent_usage?: string;
  /** Estratégia de contraste (ex: "high contrast mono com brand pop"). */
  contrast_strategy?: string;
}

export interface LayoutDNA {
  /** Tipo de layout (ex: "split asymmetric 60/40", "centered max-w-4xl", "full-bleed grid"). */
  type: string;
  /** Sistema de grid (ex: "12 colunas", "CSS grid bento", "flex column"). */
  grid_system?: string;
  /** Ritmo de whitespace (ex: "py-20 hero, py-12 denso, py-24 respirado"). */
  whitespace_rhythm?: string;
  /** Comportamento em breakpoints (ex: "split → stack em mobile"). */
  breakpoint_behavior?: string;
  /** Nível de assimetria (0 = simétrico, 1 = radicalmente assimétrico). */
  asymmetry_level?: number;
  /** Notas sobre hierarquia visual. */
  hierarchy_notes?: string;
}

export interface ComponentPatternDNA {
  /** Tipo de componente (ex: "HeroSignature", "BentoGrid", "StatsRibbon"). */
  type: string;
  /** Anatomia do componente — partes que o compõem. */
  anatomy: string[];
  /** Comportamento (ex: "sticky on scroll", "magnetic hover", "reveal on enter"). */
  behavior?: string;
  /** Como se integra com outros componentes. */
  integration?: string;
}

export interface InteractionDNA {
  /** Tipos de interação (ex: "magnetic", "spotlight", "tilt", "cursor-follow"). */
  types?: string[];
  /** Raio de efeito para interações espaciais (ex: 120px magnetic, 400px spotlight). */
  effect_radius?: number;
  /** Feedback de hover (ex: "scale 1.02 + shadow lift", "underline grow"). */
  hover_feedback?: string;
  /** Notas sobre cursor customizado ou estados. */
  cursor_behavior?: string;
}

export interface DesignDNA {
  /** ID único (slug). */
  id: string;
  /** Nome exibível (ex: "Eleven Labs Hero 2024"). */
  name: string;
  /** URL fonte de onde foi extraído. */
  source_url: string;
  /** Categoria principal. */
  category: DesignDNACategory;
  /** Domínios onde este padrão funciona (ex: ["SaaS", "AI", "tech", "voice"]). */
  serves_domains: string[];
  /** Linguagens visuais compatíveis (ex: ["swiss", "high-tech", "editorial"]). */
  compatible_languages: string[];
  /** Moods compatíveis (ex: ["ocean", "mono", "neon"]). */
  compatible_moods: string[];
  /** Layout DNA. */
  layout: LayoutDNA;
  /** Motion DNA. */
  motion?: MotionDNA;
  /** Typography DNA. */
  typography?: TypographyDNA;
  /** Color application DNA. */
  color_application?: ColorApplicationDNA;
  /** Component patterns presentes. */
  component_patterns?: ComponentPatternDNA[];
  /** Interaction vocabulary. */
  interactions?: InteractionDNA;
  /** Notas de implementação — dicas técnicas para o builder. */
  implementation_notes?: string;
  /** Score de qualidade (0-10, baseado em awards/reconhecimento). */
  quality_score?: number;
  /** Fonte do score (ex: "Awwwards SOTD", "FWA", "curadoria interna"). */
  quality_source?: string;
  /** Quando foi extraído/curado. */
  extracted_at: string;
  /** Se foi validado por designer humano. */
  validated: boolean;
}

/**
 * Resumo compacto de um DesignDNA para injeção no prompt do LLM.
 * O LLM lê o resumo (barato) e pode fs_read o DNA completo quando precisar.
 */
export function designDnaSummary(dna: DesignDNA): string {
  const parts: string[] = [
    `${dna.name} (${dna.id}) [${dna.category}]`,
    `  Layout: ${dna.layout.type}`,
  ];
  if (dna.motion) {
    parts.push(`  Motion: ${dna.motion.types.join(", ")}${dna.motion.parallax_layers ? ` (parallax ${dna.motion.parallax_layers.join("/")})` : ""}`);
  }
  if (dna.typography) {
    parts.push(`  Typography: ${dna.typography.font_stack}${dna.typography.variable_font ? " (variable)" : ""}`);
  }
  if (dna.color_application) {
    parts.push(`  Color: ${dna.color_application.brand_application}`);
  }
  if (dna.component_patterns?.length) {
    parts.push(`  Components: ${dna.component_patterns.map((c) => c.type).join(", ")}`);
  }
  if (dna.interactions?.types?.length) {
    parts.push(`  Interactions: ${dna.interactions.types.join(", ")}`);
  }
  parts.push(`  Serves: ${dna.serves_domains.join(", ")}`);
  parts.push(`  Languages: ${dna.compatible_languages.join(", ")}`);
  if (dna.quality_score) {
    parts.push(`  Quality: ${dna.quality_score}/10${dna.quality_source ? ` (${dna.quality_source})` : ""}`);
  }
  return parts.join("\n");
}

/**
 * Catálogo completo de DesignDNAs para o prompt do agente.
 * Injetado como resumo — o agente faz fs_read do DNA completo quando precisa.
 */
export function designDnaCatalogSummary(dnas: DesignDNA[]): string {
  return dnas.map(designDnaSummary).join("\n\n");
}
