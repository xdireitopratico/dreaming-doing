const FENCE_BLOCK_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

export const CHAT_DIAGRAM_LANGUAGES = new Set(["mermaid", "wireframe"]);

const PROGRAMMING_FENCE_LANGS = new Set([
  "typescript",
  "ts",
  "tsx",
  "javascript",
  "js",
  "jsx",
  "python",
  "py",
  "css",
  "scss",
  "html",
  "json",
  "sql",
  "bash",
  "sh",
  "shell",
  "zsh",
  "yaml",
  "yml",
  "java",
  "go",
  "rust",
  "rs",
  "php",
  "ruby",
  "rb",
  "swift",
  "kotlin",
  "dart",
  "vue",
  "svelte",
]);

const CHAT_DRAWING_ALIASES = new Set(["ascii", "diagram", "text", "drawing", "art"]);

export function isChatDiagramFence(lang: string | undefined | null): boolean {
  return CHAT_DIAGRAM_LANGUAGES.has((lang ?? "").trim().toLowerCase());
}

export function shouldPreserveChatFence(lang: string | undefined | null): boolean {
  const l = (lang ?? "").trim().toLowerCase();
  if (isChatDiagramFence(l)) return true;
  if (CHAT_DRAWING_ALIASES.has(l)) return true;
  if (!l) return true;
  if (PROGRAMMING_FENCE_LANGS.has(l)) return false;
  return true;
}

export function stripNonDiagramFences(text: string): string {
  return text.replace(FENCE_BLOCK_RE, (full, lang: string) =>
    shouldPreserveChatFence(lang) ? full : "",
  );
}