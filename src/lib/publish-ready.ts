import type { ProjectStackKind } from "@/lib/detect-project-kind";

/** Entry ainda no placeholder do seed — não mostrar no preview nem publicar. */
export function isSeedPlaceholderEntryContent(content: string | undefined | null): boolean {
  if (!content?.trim()) return true;
  const c = content.trim();
  if (/canvas vazio/i.test(c)) return true;
  if (/aguardando o primeiro plano aprovado/i.test(c)) return true;
  if (/>\s*Começar\s*</i.test(c)) return true;
  if (
    /aria-hidden/i.test(c) &&
    !/<(main|section|header|footer|nav|article|h[1-6]|p|button|form|img)\b/i.test(c)
  ) {
    return true;
  }
  return false;
}

export function projectEntryPath(stack: ProjectStackKind | null): string {
  return stack === "expo" ? "app/index.tsx" : "src/App.tsx";
}

function findFile(
  files: Array<{ path: string; content?: string }>,
  entryPath: string,
): { path: string; content?: string } | undefined {
  return files.find(
    (f) => f.path === entryPath || f.path === `/${entryPath}` || f.path.endsWith(`/${entryPath}`),
  );
}

/** Só publicar quando o entry do app saiu do placeholder do seed. */
export function isProjectPublishReady(
  files: Array<{ path: string; content?: string }>,
  projectStack: ProjectStackKind | null,
): boolean {
  if (projectStack === "android-native" || projectStack === "mixed") return false;
  const entry = findFile(files, projectEntryPath(projectStack));
  if (!entry?.content?.trim()) return false;
  return !isSeedPlaceholderEntryContent(entry.content);
}
