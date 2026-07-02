import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assertCanonicalPreviewUrl,
  buildLivePreviewUrl,
  buildCdpHost,
  ensurePreview,
  CDP_PORT,
  PREVIEW_PORT,
} from "./design-dna-preview";

const mockRunInSandbox = vi.fn();
const mockAppendJobEvent = vi.fn();

vi.mock("./e2b-client", () => ({
  runInSandbox: (...args: unknown[]) => mockRunInSandbox(...args),
}));

vi.mock("../functions/_shared-design-dna", () => ({
  appendJobEvent: (...args: unknown[]) => mockAppendJobEvent(...args),
}));

describe("design-dna-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildLivePreviewUrl uses port 6080 (not CDP)", () => {
    const url = buildLivePreviewUrl("sandbox-abc");
    expect(url).toBe(`https://${PREVIEW_PORT}-sandbox-abc.e2b.app`);
    expect(url).not.toContain(String(CDP_PORT));
  });

  it("buildCdpHost uses CDP port 9222", () => {
    expect(buildCdpHost("sandbox-abc")).toBe(`${CDP_PORT}-sandbox-abc.e2b.app`);
  });

  it("assertCanonicalPreviewUrl rejeita porta CDP", () => {
    expect(() => assertCanonicalPreviewUrl(`https://${CDP_PORT}-sb.e2b.app`)).toThrow(
      /previewUrl inválido|anti-padrão A1/,
    );
    expect(() =>
      assertCanonicalPreviewUrl(buildLivePreviewUrl("sb")),
    ).not.toThrow();
  });

  it("ensurePreview throws when CDP is not ready", async () => {
    mockRunInSandbox.mockResolvedValue({ stdout: "CDP_NOT_READY" });

    const supabase = {} as never;
    await expect(
      ensurePreview(supabase, "job-1", "sb-1", "token"),
    ).rejects.toThrow(/CDP not responding/);

    expect(mockAppendJobEvent).toHaveBeenCalledWith(
      supabase,
      "job-1",
      "preview_error",
      expect.objectContaining({ code: "cdp_not_ready" }),
    );
  });

  it("ensurePreview returns previewUrl when CDP and live view are ready", async () => {
    mockRunInSandbox.mockImplementation(async (_id, _token, cmd: string) => {
      if (cmd.includes("/json/version")) {
        return { stdout: "CDP_READY" };
      }
      if (cmd.includes(String(PREVIEW_PORT))) {
        return { stdout: "200" };
      }
      return { stdout: "" };
    });

    const supabase = {} as never;
    const result = await ensurePreview(supabase, "job-1", "sb-1", "token");

    expect(result.previewUrl).toBe(buildLivePreviewUrl("sb-1"));
    expect(result.cdpReady).toBe(true);
    expect(result.liveViewReady).toBe(true);
    expect(mockAppendJobEvent).toHaveBeenCalledWith(
      supabase,
      "job-1",
      "sandbox_ready",
      expect.objectContaining({
        previewUrl: result.previewUrl,
        liveViewPort: PREVIEW_PORT,
        cdpPort: CDP_PORT,
      }),
    );
  });
});