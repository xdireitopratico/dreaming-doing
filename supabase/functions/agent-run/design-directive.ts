// design-directive.ts — Bloco markdown de direção de design aprovada (Plan → Build).
import type { DesignPlanField } from "./types.ts";

export function buildDesignDirectiveBlock(designRaw: unknown): string {
  if (!designRaw || typeof designRaw !== "object") return "";
  const d = designRaw as Record<string, unknown>;
  const voice = Array.isArray(d.voice) ? (d.voice as string[]).join(" + ") : "";
  const moment = typeof d.moment === "string" ? d.moment : "";
  const techniques = Array.isArray(d.techniques) ? (d.techniques as string[]).join(", ") : "";
  const mood = typeof d.mood === "string" ? d.mood : "";
  const reasoning = typeof d.synthesis_reasoning === "string" ? d.synthesis_reasoning : "";
  const antiPatterns = Array.isArray(d.anti_patterns) ? (d.anti_patterns as string[]) : [];
  const references = Array.isArray(d.references) ? (d.references as Record<string, unknown>[]) : [];

  if (!voice && !moment) return "";

  const lines: string[] = ["", "---", "## DIREÇÃO DE DESIGN APROVADA", ""];

  if (voice) lines.push(`**Voice:** ${voice}`);
  if (mood) lines.push(`**Mood:** ${mood}`);
  if (moment) lines.push(`**Momento-memorável:** ${moment}`);
  if (techniques) lines.push(`**Técnicas:** ${techniques}`);
  const compositions = Array.isArray(d.compositions) ? (d.compositions as string[]).join(", ") : "";
  const compositionExports = Array.isArray(d.composition_exports)
    ? (d.composition_exports as string[]).join(", ")
    : "";
  const dnas = Array.isArray(d.relevant_dnas) ? (d.relevant_dnas as string[]).join(", ") : "";
  const readPaths = Array.isArray(d.read_paths) ? (d.read_paths as string[]).join("\n  - ") : "";
  if (compositions) lines.push(`**Compositions:** ${compositions}`);
  if (compositionExports) lines.push(`**Exports:** ${compositionExports}`);
  if (dnas) lines.push(`**DNA:** ${dnas}`);
  if (readPaths) {
    lines.push("", "**fs_read OBRIGATÓRIO antes do 1º patch UI:**");
    lines.push(`  - ${readPaths}`);
  }
  if (reasoning) lines.push(`**Reasoning:** ${reasoning}`);

  if (references.length > 0) {
    lines.push("", "**Referências visuais:**");
    for (const ref of references) {
      const url = typeof ref.url === "string" ? ref.url : "";
      const title = typeof ref.title === "string" ? ref.title : url;
      if (url) lines.push(`- ${title} — ${url}`);
    }
  }

  if (antiPatterns.length > 0) {
    lines.push("", "**Anti-padrões a evitar:**");
    for (const ap of antiPatterns) lines.push(`- ${ap}`);
  }

  lines.push(
    "",
    "Siga esta direção ao construir. Não improvise — execute a síntese aprovada.",
    "---",
    "",
  );

  return lines.join("\n");
}

export function buildDesignDirectiveFromField(design?: DesignPlanField): string {
  if (!design?.voice?.length || !design.moment?.trim()) return "";
  return buildDesignDirectiveBlock(design);
}