/** Detecta stack do projeto a partir dos arquivos (informativo + banner honesto). */

export type ProjectKind = "web" | "mobile";

export type ProjectStackKind = "web" | "expo" | "android-native" | "mixed";

const MOBILE_PATH_HINTS = [
  "app.json",
  "app.config",
  "capacitor.config",
  "android/",
  "ios/",
  "expo/",
];

const ANDROID_NATIVE_HINTS = [
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradle.properties",
  "app/src/main",
  "gradlew",
];

const WEB_PATH_HINTS = [
  "vite.config",
  "index.html",
  "src/app.tsx",
  "src/main.tsx",
];

const MOBILE_PKG_RE =
  /"(expo|react-native|@expo\/|expo-router|react-native-web|@capacitor\/)/i;

const WEB_PKG_RE = /"(vite|@vitejs\/|react-dom|@forge\/)/i;

function normalizePaths(files: Array<{ path: string }>): string[] {
  return files.map((f) => f.path.replace(/^\//, "").toLowerCase());
}

function pathHints(paths: string[], hints: string[]): boolean {
  return paths.some((p) => hints.some((h) => p.includes(h)));
}

export function detectProjectStack(
  files: Array<{ path: string; content?: string }>,
): ProjectStackKind | null {
  if (files.length === 0) return null;

  const paths = normalizePaths(files);
  const pkg = files.find((f) => /(^|\/)package\.json$/i.test(f.path));
  const pkgContent = pkg?.content ?? "";

  const hasAndroidNative = pathHints(paths, ANDROID_NATIVE_HINTS);
  const hasExpo =
    pathHints(paths, MOBILE_PATH_HINTS.filter((h) => h !== "android/" && h !== "ios/")) ||
    MOBILE_PKG_RE.test(pkgContent);
  const hasWeb =
    pathHints(paths, WEB_PATH_HINTS) || WEB_PKG_RE.test(pkgContent);

  if (hasAndroidNative && hasWeb) return "mixed";
  if (hasAndroidNative) return "android-native";
  if (hasExpo) return "expo";
  if (hasWeb) return "web";
  return "web";
}

export function stackKindLabel(kind: ProjectStackKind): string {
  switch (kind) {
    case "android-native":
      return "Projeto mobile nativo (Android/Kotlin)";
    case "expo":
      return "Projeto Expo / React Native";
    case "mixed":
      return "Projeto misto (web + mobile nativo)";
    default:
      return "Projeto web";
  }
}

/** Compat: web vs mobile genérico. */
export function detectProjectKind(
  files: Array<{ path: string; content?: string }>,
): ProjectKind | null {
  const stack = detectProjectStack(files);
  if (!stack) return null;
  return stack === "web" ? "web" : "mobile";
}