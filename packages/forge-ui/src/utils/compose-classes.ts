import { cn } from "./index";

type Layer = Record<string, string | undefined>;

/** Compõe classes por camada semântica (base → variant → state). */
export function composeClasses(layers: Layer[]): string {
  return cn(...layers.map((layer) => Object.values(layer).filter(Boolean)));
}

export function sectionShell(bg: string, padding: string, extra?: string): string {
  return composeClasses([{ base: "relative w-full overflow-hidden" }, { bg, padding, extra }]);
}
