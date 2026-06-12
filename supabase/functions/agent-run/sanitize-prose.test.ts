import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeUserFacingProse } from "./sanitize-prose.ts";

Deno.test("sanitizeUserFacingProse — remove fences e paths", () => {
  const raw = [
    "Olha o que já tá no `src/index.css` — tokens prontos:",
    "```css",
    "--color-brand-500: #FFB627;",
    "```",
    "**Minha escolha:** dark industrial + âmbar.",
  ].join("\n");

  const out = sanitizeUserFacingProse(raw);
  assertEquals(out.includes("src/index.css"), false);
  assertEquals(out.includes("--color-brand"), false);
  assertEquals(out.includes("dark industrial"), true);
});