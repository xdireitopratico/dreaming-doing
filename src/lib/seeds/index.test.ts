import { describe, expect, it } from "vitest";
import { seedForStack } from "@/lib/seeds";

describe("seedForStack", () => {
  it("retorna expo seed", () => {
    const files = seedForStack("expo");
    expect(files.some((f) => f.path === "app.json")).toBe(true);
    expect(files.some((f) => f.path === "app/index.tsx")).toBe(true);
  });

  it("retorna android-native seed", () => {
    const files = seedForStack("android-native");
    expect(files.some((f) => f.path === "app/build.gradle.kts")).toBe(true);
  });

  it("default vite para custom", () => {
    const files = seedForStack("custom");
    expect(files.some((f) => f.path === "vite.config.ts")).toBe(true);
  });
});
