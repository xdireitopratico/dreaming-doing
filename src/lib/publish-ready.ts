import type { ProjectStackKind } from "@/lib/detect-project-kind";

/** Espelha qualify.ts — entry ainda no placeholder do seed. */
export function isSeedPlaceholderEntryContent(content: string | undefined | null): boolean {
  if (!content) return true;
  return /canvas vazio/i.test(content);
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
