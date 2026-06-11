/** Nomes de projeto vindos do 1º prompt costumam ser frases longas — não usar como título. */
export function projectDisplayName(projectName?: string | null): string {
  const raw = projectName?.trim();
  if (!raw) return "Projeto";
  if (raw.length > 42 || /\b(landing|crie|faça|faz|por favor|porfavor)\b/i.test(raw)) {
    return "Novo projeto";
  }
  return raw;
}
