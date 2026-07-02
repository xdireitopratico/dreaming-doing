import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunSandboxCdpAction = vi.fn();

vi.mock("./sandbox-browser-driver", () => ({
  runSandboxCdpAction: (...args: unknown[]) => mockRunSandboxCdpAction(...args),
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

describe("browser-cdp-tools — sandbox Playwright driver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sandboxPreviewUrl uses live view port (not CDP)", () => {
    const url = sandboxPreviewUrl("sb-123");
    expect(url).toBe(`https://${PREVIEW_PORT}-sb-123.e2b.app`);
    expect(url).not.toContain("9222");
  });

  it("navigateTo returns success when driver succeeds", async () => {
    mockRunSandboxCdpAction.mockResolvedValue({
      ok: true,
      data: { success: true, url: "https://example.com" },
    });

    const result = await navigateTo("sb-123", "token", "https://example.com");
    expect(result.success).toBe(true);
    expect(mockRunSandboxCdpAction).toHaveBeenCalledWith(
      "sb-123",
      "token",
      expect.objectContaining({ action: "navigate", url: "https://example.com" }),
      expect.any(Object),
    );
  });

  it("navigateTo fails when driver errors", async () => {
    mockRunSandboxCdpAction.mockResolvedValue({ ok: false, error: "CDP timeout" });

    const result = await navigateTo("sb-123", "token", "https://example.com");
    expect(result.success).toBe(false);
    expect(result.error).toContain("CDP timeout");
  });

  it("takeScreenshot returns base64 on success", async () => {
    mockRunSandboxCdpAction.mockResolvedValue({
      ok: true,
      data: { base64: "abc123" },
    });

    const result = await takeScreenshot("sb-123", "token", false);
    expect(result.base64).toBe("abc123");
  });

  it("scrollPage returns success", async () => {
    mockRunSandboxCdpAction.mockResolvedValue({ ok: true, data: { success: true } });

    const result = await scrollPage("sb-123", "token", 500);
    expect(result.success).toBe(true);
  });

  it("analyzeElement extracts element data", async () => {
    mockRunSandboxCdpAction.mockResolvedValue({
      ok: true,
      data: {
        tagName: "SECTION",
        text: "Hero text",
        html: "<section>...</section>",
        rect: { x: 0, y: 0, width: 100, height: 100 },
        styles: { color: "rgb(0,0,0)" },
      },
    });

    const result = await analyzeElement("sb-123", "token", ".hero");
    expect(result.tagName).toBe("SECTION");
  });

  it("clickElement returns success", async () => {
    mockRunSandboxCdpAction.mockResolvedValue({ ok: true, data: { success: true } });

    const result = await clickElement("sb-123", "token", "button");
    expect(result.success).toBe(true);
  });

  it("typeText succeeds via driver", async () => {
    mockRunSandboxCdpAction.mockResolvedValue({ ok: true, data: { success: true } });

    const result = await typeText("sb-123", "token", "input", `He said "Hi"\nline`);
    expect(result.success).toBe(true);
    expect(mockRunSandboxCdpAction).toHaveBeenCalledWith(
      "sb-123",
      "token",
      expect.objectContaining({
        action: "type",
        selector: "input",
        text: `He said "Hi"\nline`,
      }),
    );
  });
});