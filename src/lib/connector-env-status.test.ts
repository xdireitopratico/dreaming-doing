import { describe, expect, it } from "vitest";
import { connectedEnvsFromRows } from "@/lib/connector-env-status";

describe("connectedEnvsFromRows", () => {
  it("marca custom-inception como conectado", () => {
    const out = connectedEnvsFromRows([
      {
        kind: "openai",
        provider: "custom-inception",
        meta: { provider: "custom-inception", baseUrl: "https://api.inceptionlabs.ai/v1" },
      },
    ]);
    expect(out["custom-inception"]).toBe(true);
    expect(out.xai).toBe(false);
  });

  it("xai e openai coexistem", () => {
    const out = connectedEnvsFromRows([
      { kind: "openai", provider: "xai", meta: { provider: "xai" } },
      { kind: "openai", provider: "openai", meta: { provider: "openai" } },
    ]);
    expect(out.xai).toBe(true);
    expect(out.openai).toBe(true);
  });
});