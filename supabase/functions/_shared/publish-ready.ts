import {
  findProjectEntryFile,
  isSeedPlaceholderAppContent,
} from "../agent-run/qualify.ts";

type StackKind = "web" | "expo" | "android-native" | "mixed" | null;

function detectStackFromFiles(
  files: Array<{ path: string; content: string }>,
): StackKind {
  const normalized = files.map((f) => f.path.replace(/^\//, "").toLowerCase());
  const hasAndroid = normalized.some(
    (p) => p.includes("build.gradle") || p.includes("app/src/main"),
  );
  const hasExpo = files.some((f) => {
    const p = f.path.replace(/^\//, "");
    if (p === "app.json") return true;
    if (p === "package.json" && f.content.includes('"expo"')) return true;
    return false;
  });
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
  const stack = detectStackFromFiles(files);
  if (stack === "android-native" || stack === "mixed") return false;
  const entry = findProjectEntryFile(files);
  if (!entry?.content?.trim()) return false;
  return !isSeedPlaceholderAppContent(entry.content);
}