import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  pathsAreConfigOnly,
  resolveValidationMode,
  touchedPathsIncludeSrc,
} from "./validation-policy.ts";

Deno.test("resolveValidationMode — off for config only sem src", () => {
  assertEquals(
    resolveValidationMode({
      touchedPaths: new Set(["package.json", "vite.config.ts"]),
      hasSrcTree: false,
      loopStep: 5,
      isFinalGate: false,
      lastValidationStep: 0,
    }),
    "off",
  );
});

Deno.test("resolveValidationMode — light com src entre validações", () => {
  assertEquals(
    resolveValidationMode({
      touchedPaths: new Set(["src/App.tsx"]),
      hasSrcTree: true,
      loopStep: 2,
      isFinalGate: false,
      lastValidationStep: 0,
    }),
    "light",
  );
});

Deno.test("resolveValidationMode — full no gate final", () => {
  assertEquals(
    resolveValidationMode({
      touchedPaths: new Set(["src/App.tsx"]),
      hasSrcTree: true,
      loopStep: 2,
      isFinalGate: true,
      lastValidationStep: 0,
    }),
    "full",
  );
});

Deno.test("touchedPathsIncludeSrc detecta src/", () => {
  assertEquals(touchedPathsIncludeSrc(["package.json", "src/main.tsx"]), true);
  assertEquals(pathsAreConfigOnly(["package.json"]), true);
});