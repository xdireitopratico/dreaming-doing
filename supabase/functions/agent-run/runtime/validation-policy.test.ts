import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatTypeCheckFeedback,
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

Deno.test("resolveValidationMode — meio do loop nunca full", () => {
  assertEquals(
    resolveValidationMode({
      touchedPaths: new Set(["src/App.tsx"]),
      hasSrcTree: true,
      loopStep: 10,
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

Deno.test("formatTypeCheckFeedback — cap curto para LLM", () => {
  const msg = formatTypeCheckFeedback([
    { file: "src/App.tsx", line: 10, message: "Type 'string' is not assignable to type 'number'" },
  ]);
  assertEquals(msg.startsWith("[typescript]"), true);
  assertEquals(msg.length <= 400, true);
});

Deno.test("touchedPathsIncludeSrc detecta src/", () => {
  assertEquals(touchedPathsIncludeSrc(["package.json", "src/main.tsx"]), true);
  assertEquals(pathsAreConfigOnly(["package.json"]), true);
});