import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { analyzeElement, navigateTo, scrollPage, takeScreenshot } from "./browser-cdp-tools.ts";

Deno.test("navigateTo returns success on OK relay", async () => {
  const result = await navigateTo("sb-123", "token", "https://example.com", {
    cdpSend: async () => ({ result: {} }),
  });
  assertEquals(result.success, true);
});

Deno.test("takeScreenshot returns base64 on success", async () => {
  const result = await takeScreenshot("sb-123", "token", false, {
    cdpSend: async () => ({ result: { data: "abc123" } }),
  });
  assertEquals(result.base64, "abc123");
});

Deno.test("scrollPage returns success", async () => {
  const result = await scrollPage("sb-123", "token", 500, {
    evaluateJs: async () => ({ result: "scrolled" }),
  });
  assertEquals(result.success, true);
});

Deno.test("analyzeElement extracts element data", async () => {
  const result = await analyzeElement("sb-123", "token", ".hero", {
    evaluateJs: async () => ({
      result: {
        tagName: "SECTION",
        text: "Hero text",
        html: "<section>...</section>",
        rect: { x: 0, y: 0, width: 100, height: 100 },
        styles: { color: "rgb(0,0,0)" },
      },
    }),
  });
  assertEquals(result.tagName, "SECTION");
  assertEquals(result.text, "Hero text");
});
