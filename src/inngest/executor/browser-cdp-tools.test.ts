import { describe, it, expect, vi, beforeEach } from "vitest";

const mockClient = {
  ensurePageAttached: vi.fn().mockResolvedValue("session-1"),
  sendOnPage: vi.fn(),
  once: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
};

vi.mock("./browser-cdp-websocket", () => ({
  getGlobalCdpClient: () => mockClient,
}));

import {
  analyzeElement,
  clickElement,
  navigateTo,
  sandboxPreviewUrl,
  scrollPage,
  takeScreenshot,
  typeText,
} from "./browser-cdp-tools";
import { PREVIEW_PORT } from "./design-dna-preview";

describe("browser-cdp-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.ensurePageAttached.mockResolvedValue("session-1");
  });

  it("sandboxPreviewUrl uses live view port (not CDP)", () => {
    const url = sandboxPreviewUrl("sb-123");
    expect(url).toBe(`https://${PREVIEW_PORT}-sb-123.e2b.app`);
    expect(url).not.toContain("9222");
  });

  it("navigateTo returns success when load event fires", async () => {
    mockClient.once.mockResolvedValue({});
    mockClient.sendOnPage.mockResolvedValue({});

    const result = await navigateTo("sb-123", "token", "https://example.com");
    expect(result.success).toBe(true);
    expect(mockClient.ensurePageAttached).toHaveBeenCalled();
    expect(mockClient.sendOnPage).toHaveBeenCalledWith("Page.navigate", {
      url: "https://example.com",
    });
  });

  it("navigateTo fails when load event times out", async () => {
    mockClient.once.mockRejectedValue(new Error("CDP event timeout waiting for Page.loadEventFired"));

    const result = await navigateTo("sb-123", "token", "https://example.com");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Page.loadEventFired");
  });

  it("takeScreenshot returns base64 on success", async () => {
    mockClient.sendOnPage.mockResolvedValue({ data: "abc123" });

    const result = await takeScreenshot("sb-123", "token", false);
    expect(result.base64).toBe("abc123");
    expect(mockClient.sendOnPage).toHaveBeenCalledWith("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
  });

  it("takeScreenshot returns error when data missing", async () => {
    mockClient.sendOnPage.mockResolvedValue({});

    const result = await takeScreenshot("sb-123", "token", false);
    expect(result.base64).toBe("");
    expect(result.error).toBe("Screenshot data missing");
  });

  it("scrollPage returns success", async () => {
    mockClient.sendOnPage.mockResolvedValue({
      result: { value: "scrolled" },
    });

    const result = await scrollPage("sb-123", "token", 500);
    expect(result.success).toBe(true);
  });

  it("analyzeElement extracts element data", async () => {
    mockClient.sendOnPage.mockResolvedValue({
      result: {
        value: {
          tagName: "SECTION",
          text: "Hero text",
          html: "<section>...</section>",
          rect: { x: 0, y: 0, width: 100, height: 100 },
          styles: { color: "rgb(0,0,0)" },
        },
      },
    });

    const result = await analyzeElement("sb-123", "token", ".hero");
    expect(result.tagName).toBe("SECTION");
    expect(result.text).toBe("Hero text");
  });

  it("analyzeElement returns error when element not found", async () => {
    mockClient.sendOnPage.mockResolvedValue({
      result: { value: { error: "Element not found: .missing" } },
    });

    const result = await analyzeElement("sb-123", "token", ".missing");
    expect(result.error).toBe("Element not found: .missing");
  });

  it("clickElement returns success", async () => {
    mockClient.sendOnPage.mockResolvedValue({
      result: { value: { success: true } },
    });

    const result = await clickElement("sb-123", "token", "button");
    expect(result.success).toBe(true);
  });

  it("clickElement returns success:false when element missing", async () => {
    mockClient.sendOnPage.mockResolvedValue({
      result: { value: { success: false, error: "Element not found" } },
    });

    const result = await clickElement("sb-123", "token", "button");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Element not found");
  });

  it("typeText handles text with quotes, backslashes and newlines", async () => {
    const injected: unknown[] = [];
    mockClient.sendOnPage.mockImplementation(async (_method, params) => {
      injected.push((params as { expression: string }).expression);
      return { result: { value: "typed" } };
    });

    const result = await typeText("sb-123", "token", "input", `He said "Hi"\nline`);
    expect(result.success).toBe(true);
    expect(injected).toHaveLength(1);
    const expr = String(injected[0]);
    expect(expr).toContain(`const value = ${JSON.stringify(`He said "Hi"\nline`)};`);
    expect(expr).not.toContain('el.value = "');
  });
});