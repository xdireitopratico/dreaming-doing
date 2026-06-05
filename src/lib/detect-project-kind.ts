/** Detecta web vs app mobile a partir dos arquivos do projeto (somente informativo). */

export type ProjectKind = "web" | "mobile";

const MOBILE_PATH_HINTS = [
  "app.json",
  "app.config",
  "capacitor.config",
  "android/",
  "ios/",
  "expo/",
];

const MOBILE_PKG_RE =
  /"(expo|react-native|@expo\/|expo-router|react-native-web|@capacitor\/)/i;

export function detectProjectKind(
  files: Array<{ path: string; content?: string }>,
): ProjectKind | null {
  if (files.length === 0) return null;

  const paths = files.map((f) => f.path.replace(/^\//, "").toLowerCase());

  if (paths.some((p) => MOBILE_PATH_HINTS.some((h) => p.includes(h)))) {
    return "mobile";
  }

  const pkg = files.find((f) => /(^|\/)package\.json$/i.test(f.path));
  if (pkg?.content && MOBILE_PKG_RE.test(pkg.content)) {
    return "mobile";
  }

  return "web";
}