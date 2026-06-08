import { isSeedPlaceholderAppContent } from "../agent-run/qualify.ts";

type StackKind = "web" | "expo" | "android-native" | "mixed" | null;

function entryPath(stack: StackKind): string {
  return stack === "expo" ? "app/index.tsx" : "src/App.tsx";
}

function detectStackFromPaths(paths: string[]): StackKind {
  const normalized = paths.map((p) => p.replace(/^\//, "").toLowerCase());
  const hasExpo = normalized.some((p) => p === "app.json" || p.startsWith("app/"));
  const hasAndroid = normalized.some(
    (p) => p.includes("build.gradle") || p.includes("app/src/main"),
  );
  const hasWeb = normalized.some((p) => p === "src/app.tsx" || p === "index.html");
  if (hasAndroid && hasWeb) return "mixed";
  if (hasAndroid) return "android-native";
  if (hasExpo) return "expo";
  return "web";
}

/** Gate de auto-publish no servidor — não publicar canvas vazio. */
export function isProjectPublishReadyFromFiles(
  files: Array<{ path: string; content: string }>,
): boolean {
  const stack = detectStackFromPaths(files.map((f) => f.path));
  if (stack === "android-native" || stack === "mixed") return false;
  const target = entryPath(stack);
  const entry = files.find(
    (f) =>
      f.path === target ||
      f.path === `/${target}` ||
      f.path.endsWith(`/${target}`),
  );
  if (!entry?.content?.trim()) return false;
  return !isSeedPlaceholderAppContent(entry.content);
}