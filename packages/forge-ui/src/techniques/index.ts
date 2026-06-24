import type { Technique } from "./types";
import { SCROLL_REVEAL } from "./scroll-reveal";
import { STICKY_STACK } from "./sticky-stack";
import { PARALLAX_DEPTH } from "./parallax-depth";
import { MAGNETIC_INTERACTION } from "./magnetic-interaction";
import { KINETIC_TYPOGRAPHY } from "./kinetic-typography";
import { SPOTLIGHT_CURSOR } from "./spotlight-cursor";
import { TILT_HOVER } from "./tilt-hover";
import { COUNT_UP_METRICS } from "./count-up-metrics";
import { INFINITE_MARQUEE } from "./infinite-marquee";
import { ANIMATED_MESH_BACKGROUND } from "./animated-mesh-background";
import { GLASSMORPHISM_LAYERS } from "./glassmorphism-layers";
import { GRAIN_TEXTURE_OVERLAY } from "./grain-texture-overlay";
import { SMOOTH_SCROLL_LENIS } from "./smooth-scroll-lenis";
import { SECTION_TABS_VISUAL } from "./section-tabs-visual";
import { PROCESS_STEPS_SCROLL } from "./process-steps-scroll";
import { LOGO_MARQUEE_SOCIAL_PROOF } from "./logo-marquee-social-proof";
import { INTERACTIVE_DEMO_EMBED } from "./interactive-demo-embed";
import { PAGE_VIEW_TRANSITION } from "./page-view-transition";
import { LIQUID_BLOB_BACKGROUND } from "./liquid-blob-background";
import { VIDEO_HERO_BACKGROUND } from "./video-hero-background";
import { WEBGL_HERO_LIGHT } from "./webgl-hero-light";

export type { Technique } from "./types";

/** Catálogo completo — o "shopping center de design". */
export const TECHNIQUES: Technique[] = [
  SCROLL_REVEAL,
  STICKY_STACK,
  PARALLAX_DEPTH,
  MAGNETIC_INTERACTION,
  KINETIC_TYPOGRAPHY,
  SPOTLIGHT_CURSOR,
  TILT_HOVER,
  COUNT_UP_METRICS,
  INFINITE_MARQUEE,
  ANIMATED_MESH_BACKGROUND,
  GLASSMORPHISM_LAYERS,
  GRAIN_TEXTURE_OVERLAY,
  SMOOTH_SCROLL_LENIS,
  SECTION_TABS_VISUAL,
  PROCESS_STEPS_SCROLL,
  LOGO_MARQUEE_SOCIAL_PROOF,
  INTERACTIVE_DEMO_EMBED,
  PAGE_VIEW_TRANSITION,
  LIQUID_BLOB_BACKGROUND,
  VIDEO_HERO_BACKGROUND,
  WEBGL_HERO_LIGHT,
];

export const TECHNIQUE_BY_ID = Object.fromEntries(
  TECHNIQUES.map((t) => [t.id, t]),
) as Record<string, Technique>;

/**
 * Resumo leve pro system prompt do agente — só nome + id + one-liner.
 * O agente lê o resumo (barato) e fs_read a técnica completa quando seu
 * brief chamar por ela. É o "catálogo da vitrine"; o detalhe vem on-demand.
 */
export const TECHNIQUE_CATALOG_SUMMARY = TECHNIQUES.map(
  (t) => `- ${t.name} (${t.id}): ${t.concept}`,
).join("\n");
