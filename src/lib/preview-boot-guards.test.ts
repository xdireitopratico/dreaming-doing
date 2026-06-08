import { describe, expect, it } from "vitest";
import { isNoFilesPreviewError } from "@/lib/preview-boot-guards";

describe("isNoFilesPreviewError", () => {
  it("detecta mensagens no_files", () => {
    expect(isNoFilesPreviewError("Projeto sem arquivos — o agente ainda não gerou código.")).toBe(
      true,
    );
    expect(isNoFilesPreviewError("no_files")).toBe(true);
  });

  it("ignora outros erros", () => {
    expect(isNoFilesPreviewError("E2B creation circuit open")).toBe(false);
    expect(isNoFilesPreviewError(null)).toBe(false);
  });
});