/** Ritmo vertical entre seções — alternância de densidade e respiro. */

export const SECTION_RHYTHM = {
  hero: "py-20 md:py-28 lg:py-32",
  dense: "py-12 md:py-16",
  breathe: "py-24 md:py-32",
  cta: "py-16 md:py-24",
  footer: "pt-16 pb-8 md:pt-20 md:pb-12",
} as const;

export const sectionAlternation = [
  { bg: "bg-background", padding: SECTION_RHYTHM.hero },
  { bg: "bg-surface-1/50", padding: SECTION_RHYTHM.dense },
  { bg: "bg-background", padding: SECTION_RHYTHM.breathe },
  { bg: "bg-surface-2/30 border-y border-border", padding: SECTION_RHYTHM.cta },
] as const;
