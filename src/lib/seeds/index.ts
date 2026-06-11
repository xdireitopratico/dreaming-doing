import { ANDROID_NATIVE_SEED } from "@/lib/seeds/android-native";
import { EXPO_SEED } from "@/lib/seeds/expo";
import { VITE_REACT_SEED } from "@/lib/seeds/vite-react";
import type { SeedFile } from "@/lib/seeds/types";
import type { ProjectStackId } from "@/lib/stack-router";

export function seedForStack(stackId: ProjectStackId): SeedFile[] {
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
      return VITE_REACT_SEED;
  }
}
