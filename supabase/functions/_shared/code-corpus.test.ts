import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hashContent, inferStackKind } from "./code-corpus.ts";

Deno.test("hashContent é determinístico SHA-256 hex", async () => {
  const a = await hashContent("hello");
  const b = await hashContent("hello");
  assertEquals(a, b);
  assertEquals(a.length, 64);
});

Deno.test("inferStackKind detecta android-native", () => {
  assertEquals(inferStackKind("vite-react", "app/build.gradle.kts"), "android-native");
  assertEquals(
    inferStackKind("vite-react", "app/src/main/java/com/example/Main.kt"),
    "android-native",
  );
});

Deno.test("inferStackKind detecta expo", () => {
  assertEquals(inferStackKind("expo", "src/App.tsx"), "expo");
  assertEquals(inferStackKind("vite-react", "app.json"), "expo");
});

Deno.test("inferStackKind default web template", () => {
  assertEquals(inferStackKind("vite-react", "src/App.tsx"), "vite-react");
});