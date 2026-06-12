const FENCE_BLOCK_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

export const CHAT_DIAGRAM_LANGUAGES = new Set(["mermaid", "wireframe"]);

export function isChatDiagramFence(lang: string | undefined | null): boolean {
  return CHAT_DIAGRAM_LANGUAGES.has((lang ?? "").trim().toLowerCase());
}

/** Remove blocos de código — exceto wireframe/mermaid para diagramas no chat. */
export function stripNonDiagramFences(text: string): string {
  return text.replace(FENCE_BLOCK_RE, (full, lang: string) =>
    isChatDiagramFence(lang) ? full : "",
  );
}