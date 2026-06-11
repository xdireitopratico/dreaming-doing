import { describe, expect, it } from "vitest";
import { isStaleE2bPreviewBody, isStaleE2bPreviewError } from "@/lib/e2b-preview-stale";

describe("e2b-preview-stale", () => {
  it("detecta HTML da E2B", () => {
    expect(
      isStaleE2bPreviewBody(
        "<html><body><h1>Sandbox Not Found</h1><p>The sandbox ifxesed wasn't found.</p></body></html>",
      ),
    ).toBe(true);
  });

  it("detecta código e mensagem", () => {
    expect(isStaleE2bPreviewError("Sandbox Not Found", "e2b_sandbox_stale")).toBe(true);
    expect(isStaleE2bPreviewError("ok")).toBe(false);
  });
});
