import { describe, it, expect, vi } from "vitest";
import {
  analyzeElement,
  clickElement,
  cdpSend,
  navigateTo,
  scrollPage,
  takeScreenshot,
  typeText,
} from "./browser-cdp-tools";

describe("browser-cdp-tools", () => {
  it("cdpSend surfaces CDP JSON error", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: -32602, message: "Invalid params" } }), { status: 200 }),
      );
      await expect(cdpSend("sb-123", "token", "Foo.bar")).rejects.toThrow("CDP error -32602: Invalid params");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("navigateTo returns success on OK relay", async () => {
    const result = await navigateTo("sb-123", "token", "https://example.com", {
      cdpSend: async () => ({ result: {} }),
      evaluateJs: async () => ({ result: true }),
    });
    expect(result.success).toBe(true);
  });

  it("navigateTo fails when document.readyState polling times out", async () => {
    const result = await navigateTo("sb-123", "token", "https://example.com", {
      cdpSend: async () => ({ result: {} }),
      evaluateJs: async () => ({ result: false }),
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Navigation readyState polling timed out");
  }, 15000);

  it("takeScreenshot returns base64 on success", async () => {
    const result = await takeScreenshot("sb-123", "token", false, {
      cdpSend: async () => ({ result: { data: "abc123" } }),
    });
    expect(result.base64).toBe("abc123");
  });

  it("takeScreenshot returns error when data missing", async () => {
    const result = await takeScreenshot("sb-123", "token", false, {
      cdpSend: async () => ({ result: {} }),
    });
    expect(result.base64).toBe("");
    expect(result.error).toBe("Screenshot data missing");
  });

  it("scrollPage returns success", async () => {
    const result = await scrollPage("sb-123", "token", 500, {
      evaluateJs: async () => ({ result: "scrolled" }),
    });
    expect(result.success).toBe(true);
  });

  it("analyzeElement extracts element data", async () => {
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
    expect(result.tagName).toBe("SECTION");
    expect(result.text).toBe("Hero text");
  });

  it("analyzeElement returns error when element not found", async () => {
    const result = await analyzeElement("sb-123", "token", ".missing", {
      evaluateJs: async () => ({
        result: { error: "Element not found: .missing" },
      }),
    });
    expect(result.error).toBe("Element not found: .missing");
  });

  it("clickElement returns success on OK relay", async () => {
    const result = await clickElement("sb-123", "token", "button", {
      evaluateJs: async () => ({ result: { success: true } }),
    });
    expect(result.success).toBe(true);
  });

  it("clickElement returns success:false when element missing", async () => {
    const result = await clickElement("sb-123", "token", "button", {
      evaluateJs: async () => ({ result: { success: false, error: "Element not found" } }),
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Element not found");
  });

  it("typeText handles text with quotes, backslashes and newlines", async () => {
    const injected: string[] = [];
    const result = await typeText("sb-123", "token", "input", `He said "Hi"\nline`, {
      evaluateJs: async (_sandboxId, _accessToken, expression: string) => {
        injected.push(expression);
        return { result: "typed" };
      },
    });
    expect(result.success).toBe(true);
    expect(injected).toHaveLength(1);
    const expr = injected[0]!;
    expect(expr).toContain(`const value = ${JSON.stringify(`He said "Hi"\nline`)};`);
    expect(expr).not.toContain('el.value = "');
  });
});
