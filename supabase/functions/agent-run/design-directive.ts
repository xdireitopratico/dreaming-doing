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
  const dnaSummaries = d.dna_summaries;
  if (dnaSummaries && typeof dnaSummaries === "object") {
    lines.push("", "**DNA resumos (leia seeds se precisar adaptar):**");
    for (const [id, text] of Object.entries(dnaSummaries as Record<string, string>)) {
      if (text?.trim()) lines.push(`- ${id}: ${text.slice(0, 500)}`);
    }
  }
  const research = Array.isArray(d.research_queries) ? (d.research_queries as string[]) : [];
  if (research.length) lines.push(`**Research queries:** ${research.join("; ")}`);
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

  // ponytail: composto criacional — o brief entrega a PALETA e o CONVITE, não a receita.
  // "frase simples → memorável" depende disto: explicitar o espaço combinatório e desafiar o LLM
  // a inventar o gesto. Sem este bloco, o LLM recebe campos soltos e tende a colar o template.
  lines.push("", "## 🧬 COMPOSTO CRIACIONAL");
  lines.push("O que acontece se você juntar **isto** com **aquilo** — e adicionar **aquilo outro**?");
  lines.push("Sua paleta combinatória:");
  if (voice) lines.push(`- **Vozes:** ${voice} — leia a FILOSOFIA de cada uma, não só o nome.`);
  if (mood) lines.push(`- **Mood:** ${mood} — a temperatura emocional da página.`);
  if (techniques) {
    lines.push(
      `- **Técnicas (paleta, não mandato):** ${techniques} — combine-as pelo EFEITO perceptual. Troque livremente se outra servir melhor ao gesto memorável; o que importa é a INTENÇÃO, não a lista.`,
    );
  }
  if (compositions) {
    lines.push(
      `- **Composições opinionated:** ${compositions} — inspiração e lições de design. Absorva a INTENÇÃO; NÃO COPIE o JSX. O que constrói é seu.`,
    );
  }
  lines.push("");
  lines.push(
    "**Seu gesto-memorável é por inventar** — uma página, um momento que o usuário LEVARÁ ao fechar o laptop. Concreto. Específico deste domínio. Surpreendente. O restante da página EXISTE para servir a este gesto.",
  );

  lines.push(
    "",
    "Esta direção é seu PONTO DE PARTIDA. O framework criativo, o domínio perceptual",
    "das técnicas e seu olhar de diretor de criação vão TRANSFORMAR este conceito",
    "em uma experiência única. Permita-se surpreender — desde que cada escolha",
    "sirva ao conceito central e ao domínio do projeto.",
    "---",
    "",
  );

  return lines.join("\n");
}

export function buildDesignDirectiveFromField(design?: DesignPlanField): string {
  if (!design?.voice?.length || !design.moment?.trim()) return "";
  return buildDesignDirectiveBlock(design);
}