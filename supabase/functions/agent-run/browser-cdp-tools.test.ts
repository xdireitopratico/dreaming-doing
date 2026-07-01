import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  analyzeElement,
  clickElement,
  cdpSend,
  navigateTo,
  scrollPage,
  takeScreenshot,
  typeText,
} from "./browser-cdp-tools.ts";

Deno.test("cdpSend surfaces CDP JSON error", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { code: -32602, message: "Invalid params" } }), { status: 200 });
    let thrown = false;
    try {
      await cdpSend("sb-123", "token", "Foo.bar");
    } catch (err) {
      thrown = true;
      assertEquals((err as Error).message, "CDP error -32602: Invalid params");
    }
    assertEquals(thrown, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("navigateTo returns success on OK relay", async () => {
  const result = await navigateTo("sb-123", "token", "https://example.com", {
    cdpSend: async () => ({ result: {} }),
    evaluateJs: async () => ({ result: true }),
  });
  assertEquals(result.success, true);
});

Deno.test("navigateTo fails when document.readyState polling times out", async () => {
  const result = await navigateTo("sb-123", "token", "https://example.com", {
    cdpSend: async () => ({ result: {} }),
    evaluateJs: async () => ({ result: false }),
  });
  assertEquals(result.success, false);
  assertEquals(result.error, "Navigation readyState polling timed out");
});

Deno.test("takeScreenshot returns base64 on success", async () => {
  const result = await takeScreenshot("sb-123", "token", false, {
    cdpSend: async () => ({ result: { data: "abc123" } }),
  });
  assertEquals(result.base64, "abc123");
});

Deno.test("takeScreenshot returns error when data missing", async () => {
  const result = await takeScreenshot("sb-123", "token", false, {
    cdpSend: async () => ({ result: {} }),
  });
  assertEquals(result.base64, "");
  assertEquals(result.error, "Screenshot data missing");
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

Deno.test("analyzeElement returns error when element not found", async () => {
  const result = await analyzeElement("sb-123", "token", ".missing", {
    evaluateJs: async () => ({
      result: { error: "Element not found: .missing" },
    }),
  });
  assertEquals(result.error, "Element not found: .missing");
});

Deno.test("clickElement returns success on OK relay", async () => {
  const result = await clickElement("sb-123", "token", "button", {
    evaluateJs: async () => ({ result: { success: true } }),
  });
  assertEquals(result.success, true);
});

Deno.test("clickElement returns success:false when element missing", async () => {
  const result = await clickElement("sb-123", "token", "button", {
    evaluateJs: async () => ({ result: { success: false, error: "Element not found" } }),
  });
  assertEquals(result.success, false);
  assertEquals(result.error, "Element not found");
});

Deno.test("typeText handles text with quotes, backslashes and newlines", async () => {
  const injected: string[] = [];
  const result = await typeText("sb-123", "token", "input", `He said "Hi"\\nline`, {
    evaluateJs: async (sandboxId, accessToken, expression) => {
      injected.push(expression);
      return { result: "typed" };
    },
  });
  assertEquals(result.success, true);
  assertEquals(injected.length, 1);
  const expr = injected[0];
  // The evaluated JS should contain a JSON.stringify-encoded value assignment
  assertEquals(
    expr.includes(`const value = ${JSON.stringify(`He said "Hi"\\nline`)};`),
    true,
  );
  // It should NOT contain the broken manual escaping pattern
  assertEquals(expr.includes('el.value = "'), false);
});
