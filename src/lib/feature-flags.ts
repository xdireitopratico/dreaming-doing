/**
 * Feature flags opt-in (default OFF).
 *
 * Cada flag aqui representa um PR com critério de promoção e
 * de revert documentado em `docs/plano-chat-producao-100.md`.
 *
 * Como ativar:
 *   - URL param: `?ff=thinkingStreamIsolated,tasksAsSteps`
 *   - LocalStorage: `localStorage.setItem("ff", "thinkingStreamIsolated")`
 *
 * Para promover uma flag (default ON), mover pra código + adicionar
 * teste de regressão que prova que o caminho antigo quebra.
 */

const FLAGS = [
  "thinkingStreamIsolated",
  "thinkingLiveCounter",
  "staleDetection",
  "tasksAsSteps",
] as const;

export type FeatureFlag = (typeof FLAGS)[number];

function readUrlFlags(): Set<FeatureFlag> {
  if (typeof window === "undefined") return new Set();
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("ff") ?? "";
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is FeatureFlag => (FLAGS as readonly string[]).includes(s));
  return new Set(items);
}

function readLocalStorageFlags(): Set<FeatureFlag> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem("ff") ?? "";
    const items = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is FeatureFlag => (FLAGS as readonly string[]).includes(s));
    return new Set(items);
  } catch {
    return new Set();
  }
}

let cache: Set<FeatureFlag> | null = null;

function getEnabled(): Set<FeatureFlag> {
  if (cache) return cache;
  const fromUrl = readUrlFlags();
  const fromLs = readLocalStorageFlags();
  cache = new Set([...fromUrl, ...fromLs]);
  return cache;
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return getEnabled().has(flag);
}

export function listAvailableFlags(): readonly FeatureFlag[] {
  return FLAGS;
}
