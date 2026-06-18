import { ANDROID_NATIVE_SEED } from "@/lib/seeds/android-native";
import { EXPO_SEED } from "@/lib/seeds/expo";
import { buildViteReactSeed } from "@/lib/seeds/vite-react";
import type { SeedFile } from "@/lib/seeds/types";
import type { ProjectStackId } from "@/lib/stack-router";

/**
 * Seed por stack. O `domainPrompt` (opcional) deixa o seed vite-react nascer
 * com o mood visual sugerido pelo domínio — em vez de sempre laranja ember.
 */
export function seedForStack(
  stackId: ProjectStackId,
  domainPrompt?: string,
): SeedFile[] {
  switch (stackId) {
    case "expo":
      return EXPO_SEED;
    case "android-native":
      return ANDROID_NATIVE_SEED;
    case "vite-react":
    case "node-api":
    case "static-html":
    case "custom":
    default:
      return buildViteReactSeed(domainPrompt);
  }
}

/** Retrocompatibilidade — mood default ember. */
export const VITE_REACT_SEED = buildViteReactSeed();
