/** Política de validação pós-write — substitui observe() obrigatório após cada batch. */

export type ValidationMode = "off" | "light" | "full";

const CONFIG_ONLY_PATHS = new Set([
  "package.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "index.html",
]);

function normalizePath(path: string): string {
  return path.replace(/^\//, "");
}

export function pathsAreConfigOnly(paths: Iterable<string>): boolean {
  const list = [...paths];
  if (list.length === 0) return true;
  return list.every((p) => CONFIG_ONLY_PATHS.has(normalizePath(p)));
}

export function touchedPathsIncludeSrc(paths: Iterable<string>): boolean {
  for (const p of paths) {
    const n = normalizePath(p);
    if (n.startsWith("src/") || /\.(tsx?|jsx?)$/.test(n)) return true;
  }
  return false;
}

export function resolveValidationMode(input: {
  touchedPaths: Set<string> | string[];
  hasSrcTree: boolean;
  loopStep: number;
  isFinalGate: boolean;
  lastValidationStep: number;
}): ValidationMode {
  const paths = input.touchedPaths instanceof Set
    ? input.touchedPaths
    : new Set(input.touchedPaths);

  if (!input.hasSrcTree && pathsAreConfigOnly(paths)) return "off";
  if (input.isFinalGate) return "full";
  if (input.hasSrcTree && input.loopStep - input.lastValidationStep < 3) return "light";
  if (input.hasSrcTree && input.loopStep - input.lastValidationStep >= 3) return "full";
  return "light";
}

export function formatBuildFeedback(
  feedback: string | undefined,
  checks: Array<{ name: string; ok: boolean }>,
): string {
  const failing = checks.filter((c) => !c.ok);
  const priority = ["typescript", "build", "design-system", "tsc"];
  const primary = failing.find((c) => priority.some((p) => c.name.toLowerCase().includes(p))) ??
    failing[0];
  const name = primary?.name ?? "build";
  const snippet = (feedback ?? primary?.name ?? "erro de validação").replace(/\s+/g, " ").trim();
  const msg = `[${name}] ${snippet.slice(0, 320)}. Corrija com fs_edit.`;
  return msg.slice(0, 400);
}