import { describe, it, expect } from "vitest";
import { promptContainsRawPngBase64, sanitizeObservationForEvidence } from "./sanitize";

describe("sanitizeObservationForEvidence", () => {
  it("replaces screenshot and result.base64 above threshold", () => {
    const huge = "x".repeat(200);
    const out = sanitizeObservationForEvidence({
      type: "screenshot",
      screenshot: huge,
      result: { base64: huge },
    });
    expect(out.screenshot).toContain("omitted");
    expect((out.result as { base64: string }).base64).toContain("omitted");
  });

  it("keeps short strings intact", () => {
    const small = "abc";
    const out = sanitizeObservationForEvidence({
      type: "navigate",
      result: { ok: true, base64: small },
    });
    expect(out.result).toEqual({ ok: true, base64: small });
  });
});

describe("promptContainsRawPngBase64", () => {
  it("detects embedded PNG header", () => {
    expect(promptContainsRawPngBase64("prefix iVBORw0KGgo suffix")).toBe(true);
    expect(promptContainsRawPngBase64("[screenshot omitted, 5000 chars]")).toBe(false);
  });
});