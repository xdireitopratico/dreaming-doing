import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunSandboxCdpAction = vi.fn();

vi.mock("./sandbox-browser-driver", () => ({
  runSandboxCdpAction: (...args: unknown[]) => mockRunSandboxCdpAction(...args),
}));

import {
  analyzeElement,
  capturePageSegments,
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
    expect(mockRunSandboxCdpAction).toHaveBeenCalledWith(
      "sb-123",
      "token",
      expect.objectContaining({ action: "screenshot" }),
      expect.any(Object),
    );
  });

  it("takeScreenshot rejects fullPage (redirects to capturePageSegments)", async () => {
    const result = await takeScreenshot("sb-123", "token", true);
    expect(result.base64).toBe("");
    expect(result.error).toContain("capturePageSegments");
    expect(mockRunSandboxCdpAction).not.toHaveBeenCalled();
  });

  it("capturePageSegments returns viewport folds", async () => {
    mockRunSandboxCdpAction.mockResolvedValue({
      ok: true,
      data: {
        segments: [
          { segmentIndex: 0, scrollY: 0, base64: "a" },
          { segmentIndex: 1, scrollY: 800, base64: "b" },
          { segmentIndex: 2, scrollY: 1600, base64: "c" },
          { segmentIndex: 3, scrollY: 2400, base64: "d" },
        ],
        scrollHeight: 4000,
        viewportHeight: 800,
        segmentCount: 4,
      },
    });

    const result = await capturePageSegments("sb-123", "token");
    expect(result.segmentCount).toBe(4);
    expect(result.segments).toHaveLength(4);
    expect(mockRunSandboxCdpAction).toHaveBeenCalledWith(
      "sb-123",
      "token",
      expect.objectContaining({ action: "capture_page_segments" }),
      expect.any(Object),
    );
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